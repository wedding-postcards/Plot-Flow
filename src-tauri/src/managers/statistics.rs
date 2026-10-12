//! Local aggregate-only usage statistics. Never reads the history database.
//!
//! record() only enqueues scalar counters. One worker owns the SQLite connection,
//! serializes commits, and answers FIFO snapshot/flush barriers. Integrators must
//! call record exactly once for each accepted dictation: without an operation ID
//! this interface cannot deduplicate two intentional calls.

use chrono::{Local, NaiveDate};
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(5);
const FLUSH_TIMEOUT: Duration = Duration::from_secs(2);
const DATABASE_BUSY_TIMEOUT: Duration = Duration::from_secs(1);

/// Punctuation separates tokens; apostrophes and short hyphens join only
/// internally. Combining marks belong to the preceding letter/number.
pub(crate) fn count_words(text: &str) -> u64 {
    static WORDS: OnceLock<Regex> = OnceLock::new();
    let words = WORDS.get_or_init(|| {
        Regex::new(r"[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’ʼ\-‐‑][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*")
            .expect("the fixed Unicode word pattern is valid")
    });
    words.find_iter(text).count() as u64
}

fn validate_day(day: &str) -> Result<(), String> {
    let bytes = day.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit())
        || &day[..4] == "0000"
        || NaiveDate::parse_from_str(day, "%Y-%m-%d").is_err()
    {
        return Err("Statistics day must be a valid local YYYY-MM-DD date".into());
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DailyUsage {
    pub day: String,
    pub words: u64,
    pub audio_ms: u64,
    /// Known recordings since count tracking began; never inferred from words.
    pub records: u64,
    /// False when this day includes unknown historical recording counts.
    pub records_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct UsageStatistics {
    pub total_words: u64,
    pub total_audio_ms: u64,
    pub total_records: u64,
    pub records_complete: bool,
    pub tracking_started_day: String,
    pub daily: Vec<DailyUsage>,
}

enum WriterCommand {
    Record {
        words: u64,
        audio_ms: u64,
        day: String,
    },
    Snapshot(mpsc::Sender<Result<UsageStatistics, String>>),
    Flush(mpsc::Sender<Result<(), String>>),
    Shutdown(mpsc::Sender<Result<(), String>>),
}

pub struct StatisticsManager {
    sender: mpsc::Sender<WriterCommand>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl StatisticsManager {
    /// Open only statistics.db. A failed initialization is returned to the
    /// caller; it must log it and keep the dictation application usable.
    pub fn new(app: &AppHandle) -> anyhow::Result<Self> {
        let path = crate::portable::app_data_dir(app)?.join("statistics.db");
        let started_day = Local::now().format("%Y-%m-%d").to_string();
        let app = app.clone();
        Self::open(
            path,
            started_day,
            Box::new(move || {
                if let Err(error) = app.emit("statistics-updated", ()) {
                    log::warn!("Could not emit statistics-updated: {error}");
                }
            }),
        )
        .map_err(anyhow::Error::msg)
    }

    fn open(
        path: PathBuf,
        started_day: String,
        on_change: Box<dyn Fn() + Send>,
    ) -> Result<Self, String> {
        let connection = initialize_database(&path, &started_day)?;
        let (sender, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("statistics-writer".into())
            .spawn(move || run_writer(connection, receiver, on_change))
            .map_err(|error| format!("Could not start statistics writer: {error}"))?;
        Ok(Self {
            sender,
            worker: Mutex::new(Some(worker)),
        })
    }

    /// No SQLite, acknowledgement wait, or transcript crosses the paste path.
    /// The queue contains only counters and a date, never recognized text.
    pub fn record(&self, word_count: u64, audio_ms: u64, day: String) {
        if self
            .sender
            .send(WriterCommand::Record {
                words: word_count,
                audio_ms,
                day,
            })
            .is_err()
        {
            log::error!("Statistics writer is unavailable; usage was not recorded");
        }
    }

    /// Blocking FIFO barrier: call from spawn_blocking, never the UI thread.
    /// Every record enqueued before this request has committed or produced an
    /// explicit error before the snapshot is returned.
    pub fn snapshot(&self) -> Result<UsageStatistics, String> {
        let (reply, receive) = mpsc::channel();
        self.send(WriterCommand::Snapshot(reply))?;
        receive
            .recv_timeout(SNAPSHOT_TIMEOUT)
            .map_err(|error| format!("Statistics snapshot unavailable: {error}"))?
    }

    /// Bounded shutdown barrier. Individual records already commit durably, so
    /// this acknowledges the queue prefix without replaying/recounting it.
    pub fn flush(&self) -> Result<(), String> {
        let (reply, receive) = mpsc::channel();
        self.send(WriterCommand::Flush(reply))?;
        receive
            .recv_timeout(FLUSH_TIMEOUT)
            .map_err(|error| format!("Statistics flush failed: {error}"))?
    }

    fn send(&self, command: WriterCommand) -> Result<(), String> {
        self.sender
            .send(command)
            .map_err(|_| "Statistics writer is unavailable".to_string())
    }
}

impl Drop for StatisticsManager {
    fn drop(&mut self) {
        let (reply, receive) = mpsc::channel();
        if self.sender.send(WriterCommand::Shutdown(reply)).is_ok() {
            match receive.recv_timeout(FLUSH_TIMEOUT) {
                Ok(Ok(())) => {}
                Ok(Err(error)) => log::error!("Statistics shutdown failed: {error}"),
                Err(error) => log::error!("Statistics shutdown barrier failed: {error}"),
            }
        }
        // Never turn the bounded barrier into an unbounded join. An unfinished
        // worker is detached; a normal shutdown has already committed its queue.
        if let Ok(worker) = self.worker.get_mut() {
            if let Some(worker) = worker.take() {
                if worker.is_finished() && worker.join().is_err() {
                    log::error!("Statistics writer panicked");
                }
            }
        }
    }
}

fn initialize_database(path: &std::path::Path, started_day: &str) -> Result<Connection, String> {
    validate_day(started_day)?;
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create statistics directory: {error}"))?;
    }
    let mut connection =
        Connection::open(path).map_err(|error| format!("Cannot open statistics.db: {error}"))?;
    connection
        .busy_timeout(DATABASE_BUSY_TIMEOUT)
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = FULL;
         ",
        )
        .map_err(|error| format!("Cannot initialize statistics.db: {error}"))?;
    // Schema discovery and additive migration share one write transaction.
    // Existing word/audio values are never rewritten or reconstructed.
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction.execute_batch(
        "
         CREATE TABLE IF NOT EXISTS statistics_metadata (
             singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
             tracking_started_day TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS daily_usage (
             day TEXT PRIMARY KEY,
             words INTEGER NOT NULL CHECK (typeof(words) = 'integer' AND words >= 0),
             audio_ms INTEGER NOT NULL CHECK (typeof(audio_ms) = 'integer' AND audio_ms >= 0),
             records INTEGER NOT NULL DEFAULT 0 CHECK (typeof(records) = 'integer' AND records >= 0),
             records_complete INTEGER NOT NULL DEFAULT 1 CHECK (typeof(records_complete) = 'integer' AND records_complete IN (0, 1))
         ) WITHOUT ROWID;
         ",
        )
        .map_err(|error| format!("Cannot initialize statistics.db: {error}"))?;
    let columns: Vec<String> = {
        let mut statement = transaction
            .prepare("PRAGMA table_info(daily_usage)")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get(1))
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|error| error.to_string())?
    };
    if !columns.iter().any(|column| column == "records") {
        transaction.execute_batch("ALTER TABLE daily_usage ADD COLUMN records INTEGER NOT NULL DEFAULT 0 CHECK (typeof(records) = 'integer' AND records >= 0);")
            .map_err(|error| error.to_string())?;
    }
    if !columns.iter().any(|column| column == "records_complete") {
        transaction.execute_batch("ALTER TABLE daily_usage ADD COLUMN records_complete INTEGER NOT NULL DEFAULT 0 CHECK (typeof(records_complete) = 'integer' AND records_complete IN (0, 1));")
            .map_err(|error| error.to_string())?;
    }
    transaction.execute(
        "INSERT OR IGNORE INTO statistics_metadata (singleton, tracking_started_day) VALUES (1, ?1)",
        [started_day],
    ).map_err(|error| error.to_string())?;
    // Validate persisted state on opening; corrupt data cannot look like zero.
    read_snapshot(&transaction)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(connection)
}

fn run_writer(
    mut connection: Connection,
    receiver: mpsc::Receiver<WriterCommand>,
    on_change: Box<dyn Fn() + Send>,
) {
    // Fail closed for reads after any dropped update. Totals must never be
    // presented as complete after a write/validation error in this process.
    let mut failure: Option<String> = None;
    while let Ok(command) = receiver.recv() {
        match command {
            WriterCommand::Record {
                words,
                audio_ms,
                day,
            } => {
                if failure.is_none() {
                    match commit_record(&mut connection, words, audio_ms, &day) {
                        Ok(()) => on_change(),
                        Err(error) => {
                            log::error!("Statistics recording failed: {error}");
                            failure = Some(error);
                            // Refetch must expose sticky failure to an already
                            // open statistics view; never leave stale totals
                            // looking complete. Notify only on the first failure.
                            on_change();
                        }
                    }
                }
            }
            WriterCommand::Snapshot(reply) => {
                let result = match &failure {
                    Some(error) => Err(format!("Statistics are incomplete: {error}")),
                    None => read_snapshot(&connection),
                };
                let _ = reply.send(result);
            }
            WriterCommand::Flush(reply) => {
                let _ = reply.send(writer_health(&failure));
            }
            WriterCommand::Shutdown(reply) => {
                let _ = reply.send(writer_health(&failure));
                break;
            }
        }
    }
}

fn writer_health(failure: &Option<String>) -> Result<(), String> {
    match failure {
        Some(error) => Err(format!("Statistics are incomplete: {error}")),
        None => Ok(()),
    }
}

fn commit_record(
    connection: &mut Connection,
    words: u64,
    audio_ms: u64,
    day: &str,
) -> Result<(), String> {
    validate_day(day)?;
    let words =
        i64::try_from(words).map_err(|_| "Statistics word count exceeds SQLite integer range")?;
    let audio_ms = i64::try_from(audio_ms)
        .map_err(|_| "Statistics audio duration exceeds SQLite integer range")?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let previous: Option<(i64, i64, i64, bool)> = transaction
        .query_row(
            "SELECT words, audio_ms, records, records_complete FROM daily_usage WHERE day = ?1",
            [day],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let (old_words, old_audio, old_records, records_complete) = previous.unwrap_or((0, 0, 0, true));
    let records = old_records
        .checked_add(1)
        .ok_or("Daily statistics recording count overflow")?;
    let words = old_words
        .checked_add(words)
        .ok_or("Daily statistics word count overflow")?;
    let audio_ms = old_audio
        .checked_add(audio_ms)
        .ok_or("Daily statistics audio duration overflow")?;
    transaction
        .execute(
            "INSERT INTO daily_usage (day, words, audio_ms, records, records_complete) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(day) DO UPDATE SET words = excluded.words, audio_ms = excluded.audio_ms, records = excluded.records",
            params![day, words, audio_ms, records, records_complete],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn read_snapshot(connection: &Connection) -> Result<UsageStatistics, String> {
    let tracking_started_day: String = connection
        .query_row(
            "SELECT tracking_started_day FROM statistics_metadata WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    validate_day(&tracking_started_day)?;
    let mut statement = connection
        .prepare("SELECT day, words, audio_ms, records, records_complete FROM daily_usage ORDER BY day ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(DailyUsage {
                day: row.get(0)?,
                words: row.get(1)?,
                audio_ms: row.get(2)?,
                records: row.get(3)?,
                records_complete: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut snapshot = UsageStatistics {
        total_words: 0,
        total_audio_ms: 0,
        total_records: 0,
        records_complete: true,
        tracking_started_day,
        daily: Vec::new(),
    };
    for row in rows {
        let row = row.map_err(|error| error.to_string())?;
        validate_day(&row.day)?;
        snapshot.total_records = snapshot
            .total_records
            .checked_add(row.records)
            .ok_or("Total statistics recording count overflow")?;
        snapshot.records_complete &= row.records_complete;
        snapshot.total_words = snapshot
            .total_words
            .checked_add(row.words)
            .ok_or("Total statistics word count overflow")?;
        snapshot.total_audio_ms = snapshot
            .total_audio_ms
            .checked_add(row.audio_ms)
            .ok_or("Total statistics audio duration overflow")?;
        snapshot.daily.push(row);
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tempfile::tempdir;

    fn open(path: &std::path::Path, day: &str) -> StatisticsManager {
        StatisticsManager::open(path.to_path_buf(), day.into(), Box::new(|| {})).unwrap()
    }

    #[test]
    fn recording_counts_include_zero_word_calls_and_survive_restart() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        {
            let manager = open(&path, "2026-10-12");
            manager.record(0, 0, "2026-10-12".into());
            manager.record(4, 123, "2026-10-12".into());
            manager.record(0, 50, "2026-10-13".into());
            manager.flush().unwrap();
            manager.flush().unwrap();
            let json = serde_json::to_value(manager.snapshot().unwrap()).unwrap();
            assert_eq!(json["total_records"], 3);
            assert_eq!(json["records_complete"], true);
            assert_eq!(json["daily"][0]["records"], 2);
            assert_eq!(json["daily"][1]["records"], 1);
            assert_eq!(json["daily"][0]["records_complete"], true);
        }
        let manager = open(&path, "2026-10-14");
        let json = serde_json::to_value(manager.snapshot().unwrap()).unwrap();
        assert_eq!(json["total_records"], 3);
        assert_eq!(json["records_complete"], true);
    }

    #[test]
    fn legacy_migration_preserves_counters_and_unknown_recording_history() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        Connection::open(&path).unwrap().execute_batch(
            "CREATE TABLE statistics_metadata (singleton INTEGER PRIMARY KEY, tracking_started_day TEXT NOT NULL);
             INSERT INTO statistics_metadata VALUES (1, '2026-10-10');
             CREATE TABLE daily_usage (day TEXT PRIMARY KEY, words INTEGER NOT NULL, audio_ms INTEGER NOT NULL) WITHOUT ROWID;
             INSERT INTO daily_usage VALUES ('2026-10-10', 17, 12345), ('2026-10-11', 0, 0);"
        ).unwrap();
        {
            let manager = open(&path, "2026-10-12");
            let json = serde_json::to_value(manager.snapshot().unwrap()).unwrap();
            assert_eq!(json["total_words"], 17);
            assert_eq!(json["total_audio_ms"], 12345);
            assert_eq!(json["tracking_started_day"], "2026-10-10");
            assert_eq!(json["total_records"], 0);
            assert_eq!(json["records_complete"], false);
            for row in json["daily"].as_array().unwrap() {
                assert_eq!(row["records"], 0);
                assert_eq!(row["records_complete"], false);
            }
            manager.record(2, 100, "2026-10-10".into());
            manager.record(3, 200, "2026-10-12".into());
        }
        for _ in 0..2 {
            let manager = open(&path, "2026-10-13");
            let json = serde_json::to_value(manager.snapshot().unwrap()).unwrap();
            assert_eq!(json["total_words"], 22);
            assert_eq!(json["total_audio_ms"], 12645);
            assert_eq!(json["total_records"], 2);
            assert_eq!(json["records_complete"], false);
            assert_eq!(json["daily"][0]["words"], 19);
            assert_eq!(json["daily"][0]["audio_ms"], 12445);
            assert_eq!(json["daily"][0]["records"], 1);
            assert_eq!(json["daily"][0]["records_complete"], false);
            assert_eq!(json["daily"][2]["records"], 1);
            assert_eq!(json["daily"][2]["records_complete"], true);
        }
    }

    #[test]
    fn recording_overflow_rolls_back_words_and_audio() {
        let dir = tempdir().unwrap();
        let mut connection =
            initialize_database(&dir.path().join("statistics.db"), "2026-10-12").unwrap();
        connection.execute("INSERT INTO daily_usage (day, words, audio_ms, records, records_complete) VALUES ('2026-10-12', 7, 123, ?1, 1)", [i64::MAX]).unwrap();
        assert!(commit_record(&mut connection, 1, 50, "2026-10-12")
            .unwrap_err()
            .contains("record"));
        let counters: (i64, i64, i64) = connection
            .query_row(
                "SELECT words, audio_ms, records FROM daily_usage",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(counters, (7, 123, i64::MAX));
    }

    #[test]
    fn total_recording_overflow_is_an_error_not_a_wrapped_snapshot() {
        let dir = tempdir().unwrap();
        let connection =
            initialize_database(&dir.path().join("statistics.db"), "2026-10-12").unwrap();
        for day in ["2026-10-12", "2026-10-13", "2026-10-14"] {
            connection.execute("INSERT INTO daily_usage (day, words, audio_ms, records, records_complete) VALUES (?1, 0, 0, ?2, 1)", params![day, i64::MAX]).unwrap();
        }
        assert!(read_snapshot(&connection)
            .unwrap_err()
            .contains("recording count overflow"));
    }

    #[test]
    fn failed_migration_rolls_back_schema_and_preserves_legacy_rows() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch(
            "CREATE TABLE statistics_metadata (singleton INTEGER PRIMARY KEY, tracking_started_day TEXT NOT NULL);
             INSERT INTO statistics_metadata VALUES (1, 'invalid');
             CREATE TABLE daily_usage (day TEXT PRIMARY KEY, words INTEGER NOT NULL, audio_ms INTEGER NOT NULL) WITHOUT ROWID;
             INSERT INTO daily_usage VALUES ('2026-10-10', 17, 12345);"
        ).unwrap();
        assert!(initialize_database(&path, "2026-10-12").is_err());
        let counters: (i64, i64) = connection
            .query_row("SELECT words, audio_ms FROM daily_usage", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!(counters, (17, 12345));
        let columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('daily_usage')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(columns, 3);
        connection
            .execute(
                "UPDATE statistics_metadata SET tracking_started_day = '2026-10-10'",
                [],
            )
            .unwrap();
        let manager = open(&path, "2026-10-12");
        let snapshot = manager.snapshot().unwrap();
        assert_eq!(snapshot.total_records, 0);
        assert!(!snapshot.records_complete);
    }

    #[test]
    fn counts_empty_and_punctuation_as_zero() {
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words(" \n\t …!? — -- '' «»"), 0);
    }

    #[test]
    fn counts_unicode_letters_numbers_and_internal_connectors() {
        for (text, expected) in [
            ("Привет, мир! Ёжик 123.", 4),
            ("Hello, world! don't re-enter 42", 5),
            ("rock’n’roll по-русски X‐ray non‑stop", 4),
            ("one/two three_four five—six", 6),
            ("'hello' --world-- a--b", 4),
            ("cafe\u{301} déjà 中文 １２３", 4),
        ] {
            assert_eq!(count_words(text), expected, "{text}");
        }
    }

    #[test]
    fn dates_require_exact_local_calendar_format() {
        for day in ["2026-10-12", "2024-02-29", "2000-02-29"] {
            assert!(validate_day(day).is_ok(), "{day}");
        }
        for day in [
            "",
            "2026-1-12",
            "2026-10-2",
            "2026-02-29",
            "1900-02-29",
            "2026-04-31",
            "2026-00-01",
            "0000-01-01",
            "2026-10-12Z",
            "2026-10-12\n",
            "２０２６-10-12",
            "../2026-10-12",
        ] {
            assert!(validate_day(day).is_err(), "{day}");
        }
    }

    #[test]
    fn fresh_statistics_never_reads_or_creates_history() {
        let dir = tempdir().unwrap();
        let history = dir.path().join("history.db");
        std::fs::write(&history, b"existing private history must not be read").unwrap();
        let manager = open(&dir.path().join("statistics.db"), "2026-10-12");
        assert_eq!(
            manager.snapshot().unwrap(),
            UsageStatistics {
                total_words: 0,
                total_audio_ms: 0,
                total_records: 0,
                records_complete: true,
                tracking_started_day: "2026-10-12".into(),
                daily: vec![],
            }
        );
        assert_eq!(
            std::fs::read(history).unwrap(),
            b"existing private history must not be read"
        );
    }

    #[test]
    fn snapshot_flushes_prior_records_and_aggregates_days() {
        let dir = tempdir().unwrap();
        let manager = open(&dir.path().join("statistics.db"), "2026-10-12");
        manager.record(3, 1250, "2026-10-12".into());
        manager.record(2, 750, "2026-10-12".into());
        manager.record(0, 999, "2026-10-13".into());
        let snapshot = manager.snapshot().unwrap();
        assert_eq!(snapshot.total_words, 5);
        assert_eq!(snapshot.total_audio_ms, 2999);
        assert_eq!(
            snapshot.daily,
            vec![
                DailyUsage {
                    day: "2026-10-12".into(),
                    words: 5,
                    audio_ms: 2000,
                    records: 2,
                    records_complete: true,
                },
                DailyUsage {
                    day: "2026-10-13".into(),
                    words: 0,
                    audio_ms: 999,
                    records: 1,
                    records_complete: true,
                },
            ]
        );
    }

    #[test]
    fn restart_preserves_start_day_and_flush_does_not_recount() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        {
            let manager = open(&path, "2026-10-12");
            manager.record(7, 1234, "2026-10-12".into());
            manager.flush().unwrap();
            manager.flush().unwrap();
            assert_eq!(manager.snapshot().unwrap().total_words, 7);
        }
        let manager = open(&path, "2026-10-13");
        let snapshot = manager.snapshot().unwrap();
        assert_eq!(snapshot.tracking_started_day, "2026-10-12");
        assert_eq!(snapshot.total_words, 7);
        assert_eq!(snapshot.total_audio_ms, 1234);
        assert_eq!(snapshot.total_records, 1);
    }

    #[test]
    fn worker_rejects_invalid_dates_without_silent_partial_snapshot() {
        let dir = tempdir().unwrap();
        let manager = open(&dir.path().join("statistics.db"), "2026-10-12");
        assert_eq!(manager.snapshot().unwrap().total_words, 0);
        manager.record(1, 100, "2026-10-12".into());
        manager.record(100, 10000, "2026-02-30".into());
        assert!(manager.snapshot().is_err());
        assert!(manager.flush().is_err());
    }

    #[test]
    fn commit_failure_surfaces_on_snapshot_and_flush() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        let manager = open(&path, "2026-10-12");
        manager.flush().unwrap();
        let sabotage = rusqlite::Connection::open(&path).unwrap();
        sabotage
            .execute_batch(
                "CREATE TRIGGER reject_statistics BEFORE INSERT ON daily_usage
             BEGIN SELECT RAISE(FAIL, 'test disk-write failure'); END;",
            )
            .unwrap();
        manager.record(5, 1000, "2026-10-12".into());
        assert!(manager
            .snapshot()
            .unwrap_err()
            .contains("test disk-write failure"));
        assert!(manager.flush().is_err());
    }

    #[test]
    fn one_callback_is_counted_once_and_notifies_only_after_commit() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        let committed = Arc::new(AtomicUsize::new(0));
        let observer = Arc::clone(&committed);
        let manager = StatisticsManager::open(
            path.clone(),
            "2026-10-12".into(),
            Box::new(move || {
                let connection = rusqlite::Connection::open(&path).unwrap();
                let words: u64 = connection
                    .query_row(
                        "SELECT words FROM daily_usage WHERE day = '2026-10-12'",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap();
                assert_eq!(words, 9);
                let records: u64 = connection
                    .query_row(
                        "SELECT records FROM daily_usage WHERE day = '2026-10-12'",
                        [],
                        |row| row.get(0),
                    )
                    .unwrap();
                assert_eq!(records, 1);
                observer.fetch_add(1, Ordering::SeqCst);
            }),
        )
        .unwrap();
        manager.record(9, 1501, "2026-10-12".into());
        manager.flush().unwrap();
        manager.snapshot().unwrap();
        manager.flush().unwrap();
        assert_eq!(committed.load(Ordering::SeqCst), 1);
        assert_eq!(manager.snapshot().unwrap().total_audio_ms, 1501);
    }

    #[test]
    fn first_write_failure_notifies_readers_without_claiming_success() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("statistics.db");
        let notices = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&notices);
        let manager = StatisticsManager::open(
            path.clone(),
            "2026-10-12".into(),
            Box::new(move || {
                observed.fetch_add(1, Ordering::SeqCst);
            }),
        )
        .unwrap();
        let database = rusqlite::Connection::open(&path).unwrap();
        database
            .execute_batch(
                "CREATE TRIGGER reject_statistics BEFORE INSERT ON daily_usage
             BEGIN SELECT RAISE(FAIL, 'forced commit failure'); END;",
            )
            .unwrap();
        manager.record(5, 1234, "2026-10-12".into());
        assert!(manager.snapshot().is_err());
        assert_eq!(notices.load(Ordering::SeqCst), 1);
        manager.record(5, 1234, "2026-10-12".into());
        assert!(manager.snapshot().is_err());
        assert_eq!(notices.load(Ordering::SeqCst), 1);
        let persisted: i64 = database
            .query_row("SELECT COUNT(*) FROM daily_usage", [], |row| row.get(0))
            .unwrap();
        assert_eq!(persisted, 0);
    }

    #[test]
    fn record_enqueues_while_the_writer_is_busy() {
        let dir = tempdir().unwrap();
        let (entered, observed) = std::sync::mpsc::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let manager = Arc::new(
            StatisticsManager::open(
                dir.path().join("statistics.db"),
                "2026-10-12".into(),
                Box::new(move || {
                    entered.send(()).unwrap();
                    wait.recv_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                }),
            )
            .unwrap(),
        );
        manager.record(1, 100, "2026-10-12".into());
        observed
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        let queued = Arc::clone(&manager);
        let (sent, received) = std::sync::mpsc::channel();
        let producer = std::thread::spawn(move || {
            queued.record(2, 200, "2026-10-12".into());
            sent.send(()).unwrap();
        });
        let enqueued = received.recv_timeout(std::time::Duration::from_secs(1));
        release.send(()).unwrap();
        observed
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        release.send(()).unwrap();
        producer.join().unwrap();
        assert!(enqueued.is_ok(), "record waited for the busy writer");
        let snapshot = manager.snapshot().unwrap();
        assert_eq!(snapshot.total_words, 3);
        assert_eq!(snapshot.total_audio_ms, 300);
        assert_eq!(snapshot.total_records, 2);
    }

    #[test]
    fn flush_returns_error_within_shutdown_budget_when_writer_is_stalled() {
        let dir = tempdir().unwrap();
        let (entered, observed) = std::sync::mpsc::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let manager = StatisticsManager::open(
            dir.path().join("statistics.db"),
            "2026-10-12".into(),
            Box::new(move || {
                entered.send(()).unwrap();
                wait.recv_timeout(std::time::Duration::from_secs(10))
                    .unwrap();
            }),
        )
        .unwrap();
        manager.record(1, 100, "2026-10-12".into());
        observed
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        let started = std::time::Instant::now();
        let flushed = manager.flush();
        let elapsed = started.elapsed();
        release.send(()).unwrap();
        manager.flush().unwrap();
        assert!(
            flushed.is_err(),
            "a stalled writer cannot acknowledge the barrier"
        );
        assert!(
            elapsed < std::time::Duration::from_secs(3),
            "shutdown waited {elapsed:?}"
        );
    }

    #[test]
    fn out_of_range_counters_are_errors_not_sqlite_real_or_wrapping_values() {
        let dir = tempdir().unwrap();
        let manager = open(&dir.path().join("statistics.db"), "2026-10-12");
        assert_eq!(manager.snapshot().unwrap().total_words, 0);
        manager.record(u64::MAX, 1, "2026-10-12".into());
        assert!(manager.snapshot().is_err());
    }
}

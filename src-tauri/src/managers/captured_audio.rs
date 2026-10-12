/// Captured 16 kHz mono audio and independently measured microphone duration.
pub(crate) struct CapturedAudio {
    pub samples: Vec<f32>,
    pub duration_ms: u64,
}

impl CapturedAudio {
    pub fn new(mut samples: Vec<f32>, duration_ms: u64) -> Self {
        let captured_count = samples.len();
        // Preserve the recorder's existing minimum input for inference only.
        if captured_count > 0 && captured_count < 16_000 {
            samples.resize(20_000, 0.0);
        }
        Self {
            samples,
            duration_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::CapturedAudio;

    #[test]
    fn short_audio_keeps_real_duration_despite_inference_padding() {
        let audio = CapturedAudio::new(vec![0.5; 8_000], 500);
        assert_eq!(audio.duration_ms, 500);
        assert_eq!(audio.samples.len(), 20_000);
        assert_eq!(audio.samples[7_999], 0.5);
        assert_eq!(audio.samples[8_000], 0.0);
    }

    #[test]
    fn ordinary_audio_is_not_padded() {
        let audio = CapturedAudio::new(vec![0.5; 32_000], 2_000);
        assert_eq!(audio.duration_ms, 2_000);
        assert_eq!(audio.samples.len(), 32_000);
    }

    #[test]
    fn empty_audio_stays_empty() {
        let audio = CapturedAudio::new(Vec::new(), 0);
        assert_eq!(audio.duration_ms, 0);
        assert!(audio.samples.is_empty());
    }
}

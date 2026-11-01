/** Plain-language metric definitions for Overview / analysis (non-coder friendly). */

export type GlossaryTerm = {
  id: string;
  label: string;
  blurb: string;
};

export const METRIC_GLOSSARY: GlossaryTerm[] = [
  {
    id: "trimp",
    label: "TRIMP",
    blurb:
      "Training Impulse — how hard and how long the session stressed your body from heart rate. Higher is more load, not always better.",
  },
  {
    id: "acr",
    label: "ACR",
    blurb:
      "Acute:Chronic ratio — this week’s load versus your recent average. Too high often means injury risk; too low can mean undertraining.",
  },
  {
    id: "form",
    label: "Form",
    blurb:
      "Fitness minus fatigue (TSB-style). Positive often means fresher; very negative means accumulated fatigue.",
  },
  {
    id: "hrv",
    label: "HRV",
    blurb:
      "Heart-rate variability overnight. Compare to your own recent range — not a friend’s number.",
  },
  {
    id: "body_battery",
    label: "Body Battery",
    blurb:
      "Garmin’s energy estimate from stress, sleep, and activity. Use the day’s low–high range, not a single glance.",
  },
  {
    id: "te",
    label: "Training Effect",
    blurb:
      "Garmin 0–5 scores for aerobic and anaerobic stimulus of one session. Easy days should stay mostly aerobic-low.",
  },
];

export function glossaryById(id: string): GlossaryTerm | undefined {
  return METRIC_GLOSSARY.find((t) => t.id === id);
}

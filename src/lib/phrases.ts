/** Twelve fixed starter phrases (FR12). Positions never change; icons are plain emoji labels plus text. */
export interface StarterPhrase {
  id: string;
  label: string;
  icon: string;
}

export const STARTER_PHRASES: readonly StarterPhrase[] = [
  { id: "yes", label: "Yes", icon: "✅" },
  { id: "no", label: "No", icon: "✋" },
  { id: "maybe", label: "Maybe", icon: "🤔" },
  { id: "wait", label: "Please wait", icon: "⏳" },
  { id: "help", label: "I need help", icon: "🆘" },
  { id: "thanks", label: "Thank you", icon: "🙏" },
  { id: "want", label: "I want", icon: "👉" },
  { id: "dont-want", label: "I don't want", icon: "🚫" },
  { id: "go", label: "Let's go", icon: "🚶" },
  { id: "food", label: "Food", icon: "🍽️" },
  { id: "quiet", label: "Somewhere quiet", icon: "🤫" },
  { id: "later", label: "Later", icon: "🕒" },
];

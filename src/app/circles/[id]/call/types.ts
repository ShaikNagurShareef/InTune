export type CallKind = "audio" | "video";

export interface CallCircle {
  id: string;
  name: string;
  kind: "group" | "direct";
  avatarSeed: string;
}

export interface CallMe {
  id: string;
  displayName: string;
}

/** Choices made before joining; all can be changed during the call. */
export interface CallSettings {
  mic: boolean;
  camera: boolean;
  selfView: boolean;
  captions: boolean;
  interpreter: boolean;
  readAloud: boolean;
}

export interface ActiveCall {
  id: string;
  kind: CallKind;
  participants: { id: string; name: string }[];
}

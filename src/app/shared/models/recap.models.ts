export type ActivityKind = 'commit' | 'file' | 'note';

export type RecapActivity = {
  time: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  project: string;
};

export type CompletedWork = {
  title: string;
  description: string;
  project: string;
  filesChanged: number;
  completedAt: string;
};

export type DailyRecap = {
  dateLabel: string;
  completedWork: CompletedWork[];
  activity: RecapActivity[];
  blockers: string[];
  todayFocus: string;
};

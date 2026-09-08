export interface RubricCriterion {
  name: string;
  points: number;
  description?: string;
}

export interface Rubric {
  criteria: RubricCriterion[];
}

export interface GradeFeedback {
  overallScore: number;
  overallFeedback: string;
  criteria: { name: string; pointsEarned: number; pointsPossible: number; comment: string }[];
  strengths: string[];
  improvements: string[];
  transcription: string;
  confidence: "high" | "medium" | "low";
}

export type SubmissionStatus = "PENDING" | "GRADING" | "GRADED" | "REVIEWED" | "FAILED";

export interface SubmissionData {
  id: string;
  studentId: string | null;
  student: { id: string; name: string } | null;
  studentNameFallback: string | null;
  photoUrls: string[];
  status: SubmissionStatus;
  aiScore: number | null;
  aiFeedback: GradeFeedback | null;
  finalScore: number | null;
  teacherNotes: string | null;
}

export interface AssignmentData {
  id: string;
  title: string;
  type: string;
  pointsPossible: number;
  instructions: string | null;
  rubric: Rubric | null;
  answerKey: string | null;
  submissions: SubmissionData[];
}

import { credit, type Question } from '$lib/playroom/iq-test/questions';

/**
 * Whether a response is wholly right: full credit. The app itself deals in
 * credit (`credit`), since an answer can be partly right; tests mostly want
 * the yes or no.
 */
export function isCorrect(question: Question, response: string | null): boolean {
	return credit(question, response) === 1;
}

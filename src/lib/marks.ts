export type Mark = 'good' | 'warning' | 'serious' | 'critical' | 'unknown' | 'info';
import type { CiState, ReviewDecision } from './github.ts';
import type { Health } from './monitor.ts';

export function ciMark(state: CiState): { mark: Mark; label: string } {
	switch (state) {
		case 'SUCCESS':
			return { mark: 'good', label: 'Passing' };
		case 'FAILURE':
		case 'ERROR':
			return { mark: 'serious', label: 'Failing' };
		case 'PENDING':
		case 'EXPECTED':
			return { mark: 'warning', label: 'Running' };
		default:
			return { mark: 'unknown', label: 'No checks' };
	}
}

export function reviewMark(review: ReviewDecision, isDraft: boolean): { mark: Mark; label: string } {
	if (isDraft) return { mark: 'unknown', label: 'Draft' };
	switch (review) {
		case 'APPROVED':
			return { mark: 'good', label: 'Approved' };
		case 'CHANGES_REQUESTED':
			return { mark: 'warning', label: 'Changes requested' };
		case 'REVIEW_REQUIRED':
			return { mark: 'info', label: 'Review required' };
		default:
			return { mark: 'unknown', label: 'No review' };
	}
}

export const healthLabel: Record<Health, string> = {
	good: 'Operational',
	warning: 'Warning',
	serious: 'Degraded',
	critical: 'Down',
	unknown: 'No data'
};

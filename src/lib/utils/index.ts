export * from './ui.ts';

export const pad = (n: string | number) => {
	if (n === null || n === undefined) {
		return '';
	}
	return ('0' + n).slice(-2);
};

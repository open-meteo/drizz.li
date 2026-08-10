import { type RGBA, needsWhiteText, rgbaCss, sampleScale, temperatureScale } from './color-scales';

const toCelsius = (temperature: number, unit: string): number =>
	unit === 'celsius' ? temperature : ((temperature - 32) * 5) / 9;

export const getTempColor = (temperature: number, unit = 'celsius'): RGBA =>
	sampleScale(temperatureScale.breakpoints, temperatureScale.colors, toCelsius(temperature, unit));

export const getColor = (temperature: number, unit = 'celsius'): string =>
	rgbaCss(getTempColor(temperature, unit));

export interface TempStyle {
	bg: string;
	fg: 'white' | 'black';
}

export const getTempStyle = (temp: number, unit: string): TempStyle => {
	const rgba = getTempColor(temp, unit);
	return { bg: rgbaCss(rgba), fg: needsWhiteText(rgba) ? 'white' : 'black' };
};

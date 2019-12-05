import translationEng from "../locales/en/translation.json";
import translationFr from "../locales/fr/translation.json";

export const configuration = {
  En: {
    label: 'English',
    translations: translationEng
  },
  Fr: {
    label: 'Français',
    translations: translationFr
  },
};

export const languages = Object.keys(configuration).map(value => ({value, label: configuration[value].label}));
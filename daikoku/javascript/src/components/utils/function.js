export function partition(array, isValid) {
  return array.reduce(
    ([pass, fail], elem) => {
      return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
    },
    [[], []]
  );
}

export const randomColor = () => {
  const maxValue = 0xffffff;
  const random = Math.random() * maxValue;

  const hexCode = Math.floor(random).toString(16).padStart(6, 0);
  return `#${hexCode}`;
};

export const getColorByBgColor = (bgColor) => {
  return parseInt(bgColor.replace('#', ''), 16) > 0xffffff / 2 ? '#000' : '#fff';
};

export function partition(array: any, isValid: any) {
  return array.reduce(
    // @ts-expect-error TS(7031): Binding element 'pass' implicitly has an 'any' typ... Remove this comment to see the full error message
    ([pass, fail], elem: any) => {
      return isValid(elem) ? [[...pass, elem], fail] : [pass, [...fail, elem]];
    },
    [[], []]
  );
}

export const randomColor = () => {
  const maxValue = 0xFFFFFF;
  const random = Math.random() * maxValue;

  // @ts-expect-error TS(2345): Argument of type 'number' is not assignable to par... Remove this comment to see the full error message
  const hexCode = Math.floor(random).toString(16).padStart(6, 0)
  return `#${hexCode}`
}

export const getColorByBgColor = (bgColor: any) => {
  return (parseInt(bgColor.replace('#', ''), 16) > 0xffffff / 2) ? '#000' : '#fff';
}

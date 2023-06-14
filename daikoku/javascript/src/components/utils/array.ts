export const removeArrayIndex = (array: Array<any>, index: number) => {
  if (!index || index > array.length) {
    return array;
  }
  return array.slice(0, index).concat(array.slice(index + 1));
};

export const moveArrayIndex = (array: Array<any>, from: number, to: number) => {
  const arrayCopy = [...array];
  arrayCopy.splice(to, 0, arrayCopy.splice(from, 1)[0]);
  return arrayCopy;
};

export const insertArrayIndex = (item: any, array: Array<any>, index: number) => {
  const arrayCopy = [...array];
  arrayCopy.splice(index, 0, item);
  return arrayCopy;
};

function insertIf(condition: boolean, element: any): Array<any> {
  return condition ? [element] : [];
}
export const addArrayIf = (condition: boolean, array: Array<any>, element: any) => {
  return [
    ...insertIf(condition, element),
    ...array,
  ];
  
}


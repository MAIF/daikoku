
//FIXME: find a solution to open contact modal since it's moving in react context

export function registerContact() {
  (window as any).contact = () => console.debug('????????')
}

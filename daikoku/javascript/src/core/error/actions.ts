import { SET_ERROR, UNSET_ERROR } from './';

type Error = {
  error: {
    status: number,
    message: string,
    from?: string
  }
}
export const setError =
  ({ error }: Error) => ({
      type: SET_ERROR,
      error,
    });

export const unsetError = () => ({
    type: UNSET_ERROR,
  });
import { UseQueryResult } from "@tanstack/react-query";
import { PropsWithChildren } from "react";
import { ResponseError, isError } from "../../types";
import { Spinner } from "./Spinner";

type queryWrapperProps<T> = {
  query: UseQueryResult<ResponseError | T, unknown>
}
const queryWrapper = <T,>(props: PropsWithChildren<queryWrapperProps<T>>) => {
  if (props.query.isLoading) {
    return <Spinner />
  } else if (props.query.data && !isError(props.query)) {
    const data = props.query.data

    return (
      props.children
    )
  } else {
    return <div>Error</div> 
  }
}
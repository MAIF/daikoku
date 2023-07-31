import classNames from "classnames"
import { PropsWithChildren } from "react"
import { Spinner } from "../../utils"

type WidgetProps = {
  isLoading: boolean
  isError: boolean
  size: "small" | "medium" | "large"
  title: string
}
export const Widget = (props: PropsWithChildren<WidgetProps>) => {
  return (
    <div className={classNames("widget d-flex flex-column", props.size)}>
      <h4 className='widget-title'>{props.title}</h4>
      {props.isLoading && <Spinner />}
      {props.isError && <div className='error'>oops</div>}
      {!props.isLoading && !props.isError && <div className='flex-grow widget-body'>{props.children}</div>}
    </div>
  )
}
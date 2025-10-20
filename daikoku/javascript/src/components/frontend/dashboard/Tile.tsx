import classNames from "classnames"
import { ReactNode } from "react"
import ArrowRight from 'react-feather/dist/icons/arrow-right'


type TileProps = {
  description: string
  title: string
  icon: ReactNode
  data: { label: string, value: number }[],
  action?: () => void,
  small?: boolean
}

export const Tile = (props: TileProps) => {
  return (
    <div className={classNames("dashboard-tile", { 'flex-grow-1': !props.small })}>
      <div className="tile__header d-flex flex-row align-items-center">
        <div className="flex-grow-1">
          <div className="title d-flex flex-row justify-content-start gap-3">
            <div className="icon">
              {props.icon}
            </div>
            <h3>{props.title}</h3>
          </div>
          <div className="description">
            {props.description}
          </div>
        </div>
        {!!props.action && (<button type="button" onClick={() => props.action!()}><ArrowRight /></button>)}
      </div>
      <div className="tile_data d-flex flex-row">
        {props.data.map((item, idx) => {
          return (
            <div className="data d-flex flex-column flex-grow-1" key={idx}>
              <div className="data__label">{item.label}</div>
              <div className="data__value">{item.value}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
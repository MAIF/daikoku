import { UseQueryResult } from "@tanstack/react-query"
import { ReactNode, useContext } from "react"
import ArrowRight from 'react-feather/dist/icons/arrow-right'

import { I18nContext } from "../../../contexts"
import { isError, ResponseError } from "../../../types"
import { Spinner } from "../../utils/Spinner"
import { TDashboardData } from "./Dashboard"


type TileProps = {
  description: string
  title: string
  icon: ReactNode
  query: UseQueryResult<TDashboardData | ResponseError>
  data: (data: TDashboardData) => { label: string, value: number }[],
  action?: () => void,
  width: number
  reset: () => Promise<void>
}

export const Tile = (props: TileProps) => {
  const { translate } = useContext(I18nContext)

  return (
    <div className={"dashboard-tile"} style={{ width: `${props.width}%` }}>
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
        {!!props.action && (<button type="button" className="dashboard-tile-action" onClick={() => props.action!()}><ArrowRight /></button>)}
      </div>
      {props.query.isLoading && <Spinner />}
      {!props.query.isLoading && props.query.data && (
        <div className="tile_data d-flex flex-row">
          {isError(props.query.data) && <div className="col-12">
            <span className="alert alert-danger d-flex flex-column gap-1 align-items-center justify-content-center">
              {translate("dashboard.tile.error")}
              <button className="btn btn-outline-danger" onClick={() => props.reset()}>
                <i className='fas fa-rotate me-2' />
                {translate("dashboard.tile.error.button.label")}
              </button>
            </span>
          </div>}
          {!isError(props.query.data) && props.data(props.query.data).map((item, idx) => {
            return (
              <div className="data d-flex flex-column flex-grow-1" key={idx}>
                <div className="data__label">{item.label}</div>
                <div className="data__value">{item.value}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
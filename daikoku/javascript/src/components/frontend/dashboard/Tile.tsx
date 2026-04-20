import { UseQueryResult } from "@tanstack/react-query"
import { PropsWithChildren, ReactNode, useContext } from "react"
import ArrowRight from 'react-feather/dist/icons/arrow-right'

import { I18nContext } from "../../../contexts"
import { isError, ResponseError } from "../../../types"
import { Spinner } from "../../utils/Spinner"
import { TDashboardData } from "./Dashboard"
import classNames from "classnames"


type TileProps = {
  title: string
  secondaryDescription?: (count: number) => string
  icon: ReactNode
  query: UseQueryResult<TDashboardData | ResponseError>
  data: (data: TDashboardData) => number,
  dataSecondary?: (data: TDashboardData) => number,
  action?: () => void,
  width: number
  reset: () => Promise<void>
}

export const Tile = (props: TileProps) => {
  const { translate } = useContext(I18nContext)

  const Wrapper = (_props: PropsWithChildren<{}>) => {
    if (props.action) {
      return <button className={classNames("dashboard-tile tile--action")}
        onClick={() => props.action!()} style={{ width: `${props.width}%` }}>
        {_props.children}
      </button>
    }

    return (
      <div
        className={"dashboard-tile"}
        style={{ width: `${props.width}%` }}>
        {_props.children}
      </div>
    )

  }

  return (
    <Wrapper>
      <div className="tile__header d-flex flex-row align-items-center">
        <div className="flex-grow-1">
          <div className="title d-flex flex-row justify-content-start gap-3">
            <div className="icon">
              {props.icon}
            </div>
            <h3>{props.title}</h3>
          </div>
        </div>
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
          {!isError(props.query.data) && (
            <div className="data flex-grow-1">
              <div className="data__value">{props.data(props.query.data)}</div>
              {props.dataSecondary && (
                <div className="data__value--secondary">
                  <div className="data__value">{props.dataSecondary(props.query.data)}</div>
                  {props.secondaryDescription && (
                    <div className="data__description">
                      {props.secondaryDescription(props.dataSecondary(props.query.data))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Wrapper>
  )
}
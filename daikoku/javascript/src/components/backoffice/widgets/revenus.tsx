import { Widget } from "./widget";
import { PropsWithChildren } from "react"

type RevenusProps = {
    title: string
    size:  "small" | "medium" | "large"
  }
export const Revenus = (props:PropsWithChildren<RevenusProps>) => {
  const isLoading = false;
  const isError = false;
  return (
    <>
      <Widget
        isLoading={isLoading}
        isError={isError}
        size={props.size}
        title={props.title}
      >
        <div className="d-flex flex-column revenus">
          <div className="text-center mt-2">
            <h2>Mars 2023</h2>
          </div>
          <div className="text-center my-4">
            <h3>$4,390</h3>
          </div>
          <div className="percent d-flex align-items-center justify-content-center">
            <i className="fa-solid fa-arrow-right fa-3x"></i>
            <span className="ms-3">0%</span>
          </div>
          <div className="percent high d-flex align-items-center justify-content-center">
            <i className="fa-solid fa-arrow-right fa-3x"></i>
            <span className="ms-3">12%</span>
          </div>
          <div className="percent low d-flex align-items-center justify-content-center">
            <i className="fa-solid fa-arrow-right fa-3x"></i>
            <span className="ms-3">- 12%</span>
          </div>
        </div>
      </Widget>

    </>
  );
};

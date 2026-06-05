import { useState } from "react";
import Pagination from "react-paginate";
import Select from "react-select";

export const AtomicDesign = () => {
  const [, setPage] = useState(0);

  const demoList = [
    { label: "Service groups", options: ['1'] },
    { label: "Services", options: ['1'] },
    { label: "Routes", options: ['1'] },
  ].map((team) => {
    return { value: team, label: team.label }
  });

  const buttonTypes = ['filled', 'outline', 'neutral'] as const;
  const buttonColors = ['primary', 'success', 'info', 'warning', 'danger'] as const;

  return (
    <main role="main">
      <section className="container">
        <div className="row">
          <div className="col-12">
            <h1 className="mt-3">Colors</h1>
            Customizable
            <div style={{ display: "flex" }}>
              <span
                style={{
                  width: 100,
                  height: 100,
                  backgroundColor: "var(--error-color)",
                  color: "#000",
                }}
              >
                var(--error-color)
              </span>
              <span
                style={{
                  width: 100,
                  height: 100,
                  backgroundColor: "var(--success-color)",
                  color: "#000",
                }}
              >
                var(--success-color)
              </span>
              <span
                style={{
                  width: 100,
                  height: 100,
                  backgroundColor: "var(--info-color)",
                  color: "#000",
                }}
              >
                var(--info-color)
              </span>
              <span
                style={{
                  width: 100,
                  height: 100,
                  backgroundColor: "var(--warning-color)",
                  color: "#000",
                }}
              >
                var(--warning-color)
              </span>
              <span
                style={{
                  width: 100,
                  height: 100,
                  backgroundColor: "var(--danger-color)",
                  color: "#000",
                }}
              >
                var(--danger-color)
              </span>
            </div>

            <h1 className="mt-3">Buttons</h1>
            <small className="text-muted">hover / focus / pressed : états interactifs (survol, tab, clic)</small>
            {buttonTypes.map((type) => {
              const typeClass = type === 'filled' ? '' : `--${type}`;
              return (
                <div key={type} className="mb-3">
                  <h5 className="mt-2 text-capitalize">{type}{type === 'filled' ? ' (défaut)' : ''}</h5>
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    {buttonColors.map((color) => (
                      <button key={color} className={`btn ${typeClass} --${color}`}>
                        {color} par defaut
                      </button>
                    ))}
                  </div>
                  <div className="d-flex gap-2 align-items-center flex-wrap mt-2">
                    {buttonColors.map((color) => (
                      <button key={color} className={`btn ${typeClass} --${color} --small`}>
                        {color} small
                      </button>
                    ))}
                  </div>
                  <div className="d-flex gap-2 align-items-center flex-wrap mt-2">
                    {buttonColors.map((color) => (
                      <button key={color} className={`btn ${typeClass} --${color}`} disabled>
                        {color} disabled
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}


            <h1 className="mt-3">Pagination</h1>
            <Pagination
              containerClassName="pagination pagination--ds justify-content-start"
              previousLabel="<"
              nextLabel=">"
              breakLabel="..."
              breakClassName="break"
              pageCount={8}
              marginPagesDisplayed={1}
              pageRangeDisplayed={5}
              onPageChange={({ selected }) => setPage(selected)}
              pageClassName="page-selector"
              pageLinkClassName="btn --outline --primary"
              previousLinkClassName="btn --outline --primary"
              nextLinkClassName="btn --outline --primary"
              disabledLinkClassName="--disabled"
              activeClassName="active"
            />

            <h1>Tags</h1>
            <div className="d-flex gap-2">
              <span className="tag --primary">primary tag</span>
              <span className="tag --warning">warning tag</span>
              <span className="tag --info">info tag</span>
              <span className="tag --danger">danger tag</span>
              <span className="tag --success">success tag</span>
              <span className="tag --finished">finished tag</span>
              <span className="tag --inactive">inactive tag</span>
            </div>
            <div className="d-flex gap-2 mt-2">
              <span className="tag --primary --ghost">primary tag</span>
              <span className="tag --warning --ghost">warning tag</span>
              <span className="tag --info --ghost">info tag</span>
              <span className="tag --danger --ghost">danger tag</span>
              <span className="tag --success --ghost">success tag</span>
              <span className="tag --finished --ghost">finished tag</span>
              <span className="tag --inactive --ghost">inactive tag</span>
            </div>
            <h1>Badges</h1>
            <div className="d-flex gap-2">
              <span className="badge --primary">primary badge</span>
              <span className="badge --warning">warning badge</span>
              <span className="badge --info">info badge</span>
              <span className="badge --danger">danger badge</span>
              <span className="badge --success">success badge</span>
              <span className="badge --finished">finished badge</span>
              <span className="badge --inactive">inactive badge</span>
            </div>
            <div className="d-flex gap-2 mt-2">
              <span className="badge --primary --ghost">primary ghost badge</span>
              <span className="badge --warning --ghost">warning ghost badge</span>
              <span className="badge --info --ghost">info ghost badge</span>
              <span className="badge --danger --ghost">danger ghost badge</span>
              <span className="badge --success --ghost">success ghost badge</span>
              <span className="badge --finished --ghost">finished ghost badge</span>
              <span className="badge --inactive --ghost">inactive ghost badge</span>
            </div>
            <div className="d-flex gap-2 mt-2">
              <span className="badge --primary --state">primary state badge</span>
              <span className="badge --warning --state">warning state badge</span>
              <span className="badge --info --state">info state badge</span>
              <span className="badge --danger --state">danger state badge</span>
              <span className="badge --success --state">success state badge</span>
              <span className="badge --finished --state">finished state badge</span>
              <span className="badge --inactive --state">inactive state badge</span>
            </div>

            <h1 className="mt-3">Content</h1>
            <div className="d-flex flex-column">
              <div className="d-flex">
                <div
                  style={{
                    width: 120,
                    backgroundColor: "var(--sidebar-bg-color)",
                    color: "var(--sidebar-text-color)",
                  }}
                >
                  sidebar
                  <hr />
                  <a href="" className="notification-link-color">
                    link
                  </a>
                </div>
                <div
                  style={{
                    width: 120,
                    backgroundColor: "var(--menu-bg-color)",
                    color: "var(--menu-text-color)",
                  }}
                >
                  companion
                  <hr />
                  <a className="companion-link" href="">
                    link
                  </a>
                  <br />
                </div>

                <div
                  style={{
                    width: 600,
                    border: "1px solid",
                    padding: 10,
                  }}
                  className="level1"
                >
                  level 1
                  <hr />
                  <a className="level1-link" href="">
                    link
                  </a>
                  <div
                    className="level2"
                    style={{
                      width: 300,
                      margin: "0 auto",
                      padding: 10,
                    }}
                  >
                    level 2
                    <hr />
                    <a className="level2-link" href="">
                      link
                    </a>
                    <div
                      className="level3"
                      style={{
                        width: 200,
                        margin: "0 auto",
                        padding: 10,
                      }}
                    >
                      level 3
                      <hr />
                      <a className="level3-link" href="">
                        link
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="footer">footer</div>
            </div>
            <h1 className="mt-3">Card</h1>
            <div className="card col-4">
              <div className="card-header">Title</div>
              <div className="card-body">
                text{" "}
                <a className="a-fake--bg-color_level1" href="">
                  link
                </a>
              </div>
            </div>
            <h1 className="mt-3">Form</h1>
            <input placeholder="class form-control" className="form-control" />


            <Select
              name="demo"
              className="reactSelect"
              value={demoList[0]}
              classNamePrefix="reactSelect"
              options={demoList}
            />
          </div>
        </div>
      </section>
    </main>
  );
};

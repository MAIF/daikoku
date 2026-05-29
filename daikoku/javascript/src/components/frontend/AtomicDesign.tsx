import Select from "react-select";

export const AtomicDesign = () => {
  const demoList = [
    { label: "Service groups", options: ['1'] },
    { label: "Services", options: ['1'] },
    { label: "Routes", options: ['1'] },
  ].map((team) => {
    return { value: team, label: team.label }
  });

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
            Customizable :
            <button className="btn-outline-primary btn ms-2">
              btn btn-outline-primary
            </button>
            <br />
            Mix with customizable Colors :
            <button className="btn-outline-danger btn my-1 ms-2">
              btn btn-outline-danger
            </button>
            <button className="btn-outline-success btn mx-1 my-1">
              btn btn-outline-success
            </button>
            <button className="btn-outline-info btn mx-1 my-1">
              btn btn-outline-info
            </button>
            <h2>Buttons size</h2>
            <button className="btn-danger btn">button (default)</button>
            <button className="btn-danger btn btn-sm mx-2">btn-sm</button>
            <button className="btn-danger btn btn-lg">btn-lg</button>
            <h1 className="mt-3">Badges</h1>
            Customizable :
            <div className="badge badge-custom ms-2">badge-custom</div>
            <div className="badge badge-custom-custom ms-2">badge-custom-custom</div>
            <div className="badge badge-custom-info ms-2">badge-custom-info</div>
            <div className="badge badge-custom-success ms-2">badge-custom-success</div>
            <div className="badge badge-custom-warning ms-2">badge-custom-warning</div>
            <div className="badge badge-custom-danger ms-2">badge-custom-danger</div>

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
              <span className="badge --primary --state">primary ghost badge</span>
              <span className="badge --warning --state">warning ghost badge</span>
              <span className="badge --info --state">info ghost badge</span>
              <span className="badge --danger --state">danger ghost badge</span>
              <span className="badge --success --state">success ghost badge</span>
              <span className="badge --finished --state">finished ghost badge</span>
              <span className="badge --inactive --state">inactive ghost badge</span>
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

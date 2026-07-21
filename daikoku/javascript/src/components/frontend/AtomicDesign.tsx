import { useState } from "react";
import Pagination from "../utils/Pagination";
import Select from "react-select";

export const AtomicDesign = () => {
  const [page, setPage] = useState(0);

  const demoList = [
    { label: "Service groups", options: ['1'] },
    { label: "Services", options: ['1'] },
    { label: "Routes", options: ['1'] },
  ].map((team) => {
    return { value: team, label: team.label }
  });

  const buttonVariants = ['primary', 'secondary', 'tertiary', 'ghost'] as const;

  // Une colonne par couleur, du plus sombre au plus clair (shades existantes dans variables.scss).
  const colorScales: Record<string, string[]> = {
    primary: ['--primary-color-800', '--primary-color', '--primary-color-400', '--primary-color-bg', '--primary-color-050'],
    neutral: ['--neutral-color-900', '--neutral-color-800', '--neutral-color-700', '--neutral-color-600', '--neutral-color', '--neutral-color-400', '--neutral-color-300', '--neutral-color-200', '--neutral-color-100', '--neutral-color-050', '--neutral-color-000'],
    success: ['--success-color-800', '--success-color', '--success-color-bg'],
    warning: ['--warning-color-800', '--warning-color', '--warning-color-bg'],
    danger: ['--danger-color-800', '--danger-color', '--danger-color-bg'],
    info: ['--info-color-800', '--info-color', '--info-color-bg'],
  };

  // texte noir sur les shades claires (<=400, bg, 000), blanc sinon
  const isLightShade = (v: string) => {
    if (v.endsWith('-bg') || v.endsWith('-000')) return true;
    const m = v.match(/-(\d{2,3})$/);
    return m ? Number(m[1]) <= 400 : false;
  };

  return (
    <main role="main">
      <section className="container">
        <div className="row">
          <div className="col-12">
            <h1 className="mt-3">Colors</h1>
            Customizable
            <div className="d-flex gap-3 flex-wrap">
              {Object.entries(colorScales).map(([name, shades]) => (
                <div key={name} className="d-flex flex-column gap-1">
                  <strong className="text-capitalize mb-1">{name}</strong>
                  {shades.map((shade) => (
                    <span
                      key={shade}
                      style={{
                        width: 200,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 8px",
                        fontSize: 11,
                        backgroundColor: `var(${shade})`,
                        color: isLightShade(shade) ? "#000" : "#fff",
                      }}
                    >
                      {shade}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <h1 className="mt-3">Buttons</h1>
            <small className="">hover / focus / pressed : états interactifs (survol, tab, clic)</small>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              {buttonVariants.map((variant) => (
                <button key={variant} className={`btn --${variant}`}>
                  {variant}
                </button>
              ))}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap mt-2">
              {buttonVariants.map((variant) => (
                <button key={variant} className={`btn --${variant} --small`}>
                  {variant} small
                </button>
              ))}
            </div>
            <div className="d-flex gap-2 align-items-center flex-wrap mt-2">
              {buttonVariants.map((variant) => (
                <button key={variant} className={`btn --${variant}`} disabled>
                  {variant} disabled
                </button>
              ))}
            </div>


            <h1 className="mt-3">Pagination</h1>
            <div className="d-flex align-items-center" style={{ gap: 16 }}>
              <Pagination
                containerClassName="pagination pagination--ds"
                previousLabel="<"
                nextLabel=">"
                breakLabel="..."
                breakClassName="break"
                breakLinkClassName="btn --ghost"
                pageCount={48}
                forcePage={page}
                marginPagesDisplayed={1}
                pageRangeDisplayed={3}
                onPageChange={({ selected }) => setPage(selected)}
                pageClassName="page-selector"
                pageLinkClassName="btn --ghost"
                previousLinkClassName="btn --tertiary"
                nextLinkClassName="btn --tertiary"
                disabledLinkClassName="--disabled"
                activeClassName="active"
              />
            </div>

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

            <h1 className="mt-3">Number indicator</h1>
            <div className="d-flex gap-2">
              <span className="number-indicator">42</span>
              <span className="number-indicator --inactive">42</span>
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

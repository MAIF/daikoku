import React, { useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiRedoc } from '../../../src/components/frontend/api/ApiRedoc';
import { GlobalContext } from '../../../src/contexts/globalContext';
import '../../../src/style/main.scss';

function App() {
  const context = useContext(GlobalContext);
  return (
    <GlobalContext.Provider
      value={{ ...context, tenant: { ...context.tenant, apiReferenceHideForGuest: false } }}
    >
      <div className="d-flex flex-row">
        <div
          className="wrapper flex-grow-1 container-fluid d-flex flex-column"
          style={{ overflow: 'auto' }}
        >
          <main className="flex-grow-1">
            <div className="album p-4">
              <ApiRedoc
                swaggerUrl="/tests/fixtures/redoc/openapi.json"
                swaggerConf={{ specificationType: 'openapi' }}
                ownerTeam={{ users: [] }}
                entity={{ _id: 'example' }}
                save={() => Promise.resolve()}
              />
            </div>
          </main>
        </div>
      </div>
    </GlobalContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useState } from 'react';

import { useDaikokuBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import * as Services from '../../../services';
import { ILogger } from '../../../types';
import { clientFetchData, DynamicTable, DynamicTableFeatures, FilterDef } from '../../inputs';
import { Can, daikoku, manage } from '../../utils';
import { Info } from 'lucide-react';

const LEVELS = ['OFF', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'ALL'];

const LogLevelSelect = ({ logger }: { logger: ILogger }) => {
  const [level, setLevel] = useState(logger.level);

  const changeLevel = (newLevel: string) => {
    setLevel(newLevel);
    Services.changeLogLevel(logger.name, newLevel).then((res) => {
      if (res && res.newLevel) {
        setLevel(res.newLevel);
      }
    });
  };

  return (
    <select
      className="form-select form-select-sm"
      value={level}
      onChange={(e) => changeLevel(e.target.value)}
    >
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
};

export const LoggersList = () => {
  useDaikokuBackOffice();

  const { translate, Translation } = useContext(I18nContext);

  const columnHelper = createColumnHelper<DynamicTableFeatures, ILogger>();
  const columns = [
    columnHelper.accessor('name', {
      meta: { title: translate('Name'), size: 30 },
    }),
    columnHelper.accessor('level', {
      meta: { title: translate('Level'), size: 8, className: 'action-cell' },
      enableSorting: false,
      cell: (info) => <LogLevelSelect logger={info.row.original} />,
    }),
  ];

  const fetchData = clientFetchData<ILogger>(() => Services.getLoggers());

  const filters: FilterDef[] = [
    { id: 'name', type: 'text', placeholder: translate('Search') },
  ];

  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row p-3">
        <div className="col">
          <h1>
            <Translation i18nkey="Loggers level">Loggers level</Translation>
          </h1>
          <div className="alert alert-info" role="alert">
            <Info className='me-2' />
            <Translation i18nkey="loggers.disclaimer">
              Log levels are changed in memory, for this instance only, and are
              not persisted: they reset to their default on restart. This is
              meant for debugging purposes only.
            </Translation>
          </div>
          <div className="section p-2">
            <DynamicTable<ILogger>
              queryKey={['loggers']}
              columns={columns}
              fetchData={fetchData}
              filters={filters}
              defaultSorting={[{ id: 'name', desc: false }]}
              getRowId={row => row.name}
              getRowAriaLabel={row => row.name}
            />
          </div>
        </div>
      </div>
    </Can>
  );
};

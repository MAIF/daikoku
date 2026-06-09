import { createColumnHelper } from '@tanstack/react-table';
import { useContext, useState } from 'react';

import { useDaikokuBackOffice } from '../../../contexts';
import { I18nContext } from '../../../contexts/i18n-context';
import * as Services from '../../../services';
import { ILogger } from '../../../types';
import { Table } from '../../inputs';
import { Can, daikoku, manage } from '../../utils';

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

  const columnHelper = createColumnHelper<ILogger>();
  const columns = [
    columnHelper.accessor('name', {
      header: translate('Name'),
      meta: { style: { textAlign: 'left' } },
    }),
    columnHelper.accessor('level', {
      header: translate('Level'),
      meta: { style: { textAlign: 'center', width: '160px' } },
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => <LogLevelSelect logger={info.row.original} />,
    }),
  ];

  return (
    <Can I={manage} a={daikoku} dispatchError>
      <div className="row p-3">
        <div className="col">
          <h1>
            <Translation i18nkey="Loggers level">Loggers level</Translation>
          </h1>
          <div className="alert alert-info" role="alert">
            <i className="fas fa-info-circle me-2" />
            <Translation i18nkey="loggers.disclaimer">
              Log levels are changed in memory, for this instance only, and are
              not persisted: they reset to their default on restart. This is
              meant for debugging purposes only.
            </Translation>
          </div>
          <div className="section p-2">
            <Table
              columns={columns}
              fetchItems={() => Services.getLoggers()}
              defaultSort="name"
            />
          </div>
        </div>
      </div>
    </Can>
  );
};

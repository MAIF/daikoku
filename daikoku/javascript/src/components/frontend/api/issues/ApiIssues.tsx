import moment from 'moment';
import { Link } from 'react-router-dom';
import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import * as Services from '../../../../services/index';
import { I18nContext } from '../../../../core';
import { ApiFilter } from './ApiFilter';
import { useSelector } from 'react-redux';
import { getColorByBgColor } from '../../..';

export function ApiIssues({
  filter,
  api,
  setSelectedVersion,
  selectedVersion,
  ownerTeam,
  setFilter
}: any) {
  const [issues, setIssues] = useState([]);
  const { versionId } = useParams();
  const { connectedUser } = useSelector(state => (state as any).context);

    const { translate } = useContext(I18nContext);

  useEffect(() => {
    refresh()
  }, [api._id, selectedVersion.value]);

  const refresh = () => {
    Services.getAPIIssues(api._humanReadableId)
      .then((res) =>
        setIssues(
          res.filter((r: any) => r.apiVersion === selectedVersion.value || selectedVersion.value === 'all')
        )
      );
  }

  const filteredIssues = issues
    .filter((issue) => filter === 'all' ||
    ((issue as any).open && filter === 'open') ||
    (!(issue as any).open && filter === 'closed'))
    .sort((a, b) => ((a as any).seqId < (b as any).seqId ? 1 : -1));

  const basePath = `/${ownerTeam._humanReadableId}/${api ? api._humanReadableId : ''}/${versionId}`;
    return (<div>
            <ApiFilter pathname={basePath} tags={api.issuesTags} handleFilter={(value: any) => setFilter(value)} filter={filter} connectedUser={connectedUser} api={api} team={ownerTeam._id} ownerTeam={ownerTeam} selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion} refresh={refresh} basePath={basePath}/>
            <div className="d-flex flex-column pt-3 mt-3">
                {filteredIssues.map(({ seqId, title, tags, by, createdDate, closedDate, open, apiVersion, _id }) => (<div className="border-bottom py-3 d-flex align-items-center justify-content-between" key={`issue-${seqId}`} style={{ backgroundColor: '#fff' }}>
                            <div className="d-flex align-items-center">
                                <i className="fa fa-exclamation-circle mx-3" style={{ color: open ? 'inherit' : 'red' }}></i>
                                <div>
                                    <div>
                                        <Link to={`${_id}`} className="me-2">
                      {title}
                    </Link>
                    {(tags as any).sort((a: any, b: any) => (a.name < b.name ? -1 : 1))
                        .map((tag: any, i: any) => (<span className="badge me-1" style={{ backgroundColor: tag.color, color: getColorByBgColor(tag.color) }} key={`issue-${seqId}-tag${i}`}>
                          {tag.name}
                        </span>))}
                  </div>
                                    {open ? (<span>
                      #{seqId} {translate('issues.opened_on')}{' '}
                      {moment(createdDate).format(translate('moment.date.format.without.hours'))}{' '}
                      {translate('issues.by')} {(by as any).name}
                                        </span>) : (<span>
                      #{seqId} {translate('issues.by')} {(by as any).name}{' '}
                      {translate('was closed on')}{' '}
                      {moment(closedDate).format(translate('moment.date.format.without.hours'))}{' '}
                    </span>)}
                </div>
              </div>
                            <div className="py-2 px-3">
                                <span className="badge bg-info">{apiVersion}</span>
              </div>
            </div>))}
                {filteredIssues.length <= 0 && <p>{translate('issues.nothing_matching_filter')}</p>}
      </div>
    </div>);
}

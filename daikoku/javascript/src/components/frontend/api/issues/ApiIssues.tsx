import moment from 'moment';
import { Link } from 'react-router-dom';
import React, { useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import * as Services from '../../../../services/index';
import { I18nContext } from '../../../../core';
// @ts-expect-error TS(6142): Module './ApiFilter' was resolved to '/Users/qaube... Remove this comment to see the full error message
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

  // @ts-expect-error TS(2339): Property 'translateMethod' does not exist on type ... Remove this comment to see the full error message
  const { translateMethod } = useContext(I18nContext);

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
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return (<div>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <ApiFilter pathname={basePath} tags={api.issuesTags} handleFilter={(value: any) => setFilter(value)} filter={filter} connectedUser={connectedUser} api={api} team={ownerTeam._id} ownerTeam={ownerTeam} selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion} refresh={refresh} basePath={basePath}/>
      {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
      <div className="d-flex flex-column pt-3 mt-3">
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {filteredIssues.map(({ seqId, title, tags, by, createdDate, closedDate, open, apiVersion, _id }) => (<div className="border-bottom py-3 d-flex align-items-center justify-content-between" key={`issue-${seqId}`} style={{ backgroundColor: '#fff' }}>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="d-flex align-items-center">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <i className="fa fa-exclamation-circle mx-3" style={{ color: open ? 'inherit' : 'red' }}></i>
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  <div>
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    <Link to={`${_id}`} className="me-2">
                      {title}
                    </Link>
                    {(tags as any).sort((a: any, b: any) => (a.name < b.name ? -1 : 1))
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            .map((tag: any, i: any) => (<span className="badge me-1" style={{ backgroundColor: tag.color, color: getColorByBgColor(tag.color) }} key={`issue-${seqId}-tag${i}`}>
                          {tag.name}
                        </span>))}
                  </div>
                  {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                  {open ? (<span>
                      #{seqId} {translateMethod('issues.opened_on')}{' '}
                      {moment(createdDate).format(translateMethod('moment.date.format.without.hours'))}{' '}
                      {translateMethod('issues.by')} {(by as any).name}
                    {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                    </span>) : (<span>
                      #{seqId} {translateMethod('issues.by')} {(by as any).name}{' '}
                      {translateMethod('was closed on')}{' '}
                      {moment(closedDate).format(translateMethod('moment.date.format.without.hours'))}{' '}
                    </span>)}
                </div>
              </div>
              {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
              <div className="py-2 px-3">
                {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
                <span className="badge bg-info">{apiVersion}</span>
              </div>
            </div>))}
        {/* @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message */}
        {filteredIssues.length <= 0 && <p>{translateMethod('issues.nothing_matching_filter')}</p>}
      </div>
    </div>);
}

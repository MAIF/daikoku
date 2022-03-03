import moment from 'moment';
import { Link } from 'react-router-dom';
import React, { useContext, useEffect, useState } from 'react';
import * as Services from '../../../../services/index';
import { I18nContext } from '../../../../core';

export function ApiIssues({ filter, api, selectedVersion }) {
  const [issues, setIssues] = useState([]);

  const { translateMethod } = useContext(I18nContext);

  useEffect(() => {
    Services.getAPIIssues(api._humanReadableId).then((res) =>
      setIssues(
        res.filter((r) => r.apiVersion === selectedVersion.value || selectedVersion.value === 'all')
      )
    );
  }, [api._id, selectedVersion.value]);

  const filteredIssues = issues
    .filter(
      (issue) =>
        filter === 'all' ||
        (issue.open && filter === 'open') ||
        (!issue.open && filter === 'closed')
    )
    .sort((a, b) => (a.seqId < b.seqId ? 1 : -1));

  return (
    <div className="d-flex flex-column pt-3">
      {filteredIssues.map(
        ({ seqId, title, tags, by, createdDate, closedDate, open, apiVersion, _id }) => (
          <div
            className="border-bottom py-3 d-flex align-items-center justify-content-between"
            key={`issue-${seqId}`}
            style={{ backgroundColor: '#fff' }}
          >
            <div className="d-flex align-items-center">
              <i
                className="fa fa-exclamation-circle mx-3"
                style={{ color: open ? 'inherit' : 'red' }}
              ></i>
              <div>
                <div>
                  <Link to={`issues/${_id}`} className="me-2">
                    {title}
                  </Link>
                  {tags
                    .sort((a, b) => (a.name < b.name ? -1 : 1))
                    .map((tag, i) => (
                      <span
                        className="badge bg-primary me-1"
                        style={{ backgroundColor: tag.color }}
                        key={`issue-${seqId}-tag${i}`}
                      >
                        {tag.name}
                      </span>
                    ))}
                </div>
                {open ? (
                  <span>
                    #{seqId} {translateMethod('issues.opened_on')}{' '}
                    {moment(createdDate).format(
                      translateMethod('moment.date.format.without.hours')
                    )}{' '}
                    {translateMethod('issues.by')} {by.name}
                  </span>
                ) : (
                  <span>
                    #{seqId} {translateMethod('issues.by')} {by.name}{' '}
                    {translateMethod('was closed on')}{' '}
                    {moment(closedDate).format(translateMethod('moment.date.format.without.hours'))}{' '}
                  </span>
                )}
              </div>
            </div>
            <div className="py-2 px-3">
              <span className="badge bg-info">{apiVersion}</span>
            </div>
          </div>
        )
      )}
      {filteredIssues.length <= 0 && <p>{translateMethod('issues.nothing_matching_filter')}</p>}
    </div>
  );
}

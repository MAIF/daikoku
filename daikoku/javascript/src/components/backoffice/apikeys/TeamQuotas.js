import React, { useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import { Table } from '../../inputs';
import { Can, manage, apikey } from '../../utils';
import { I18nContext } from '../../../core';
import { useSelector } from 'react-redux'

export const TeamQuotas = (props) => {
    const { translateMethod, Translation } = useContext(I18nContext);
    let table;

    const { currentTeam } = useSelector((state) => state.context);

    const accessor = (item, remainingName, thresholdName) => {
        const remaining = (item.quotas || {})[remainingName] || 0;
        const threshold = (item.quotas || {})[thresholdName] || 0;

        const r = remaining/ threshold * 100
        if (isNaN(r))
            return "-"
        return `${remaining} (${r}%)`
    }

    const columns = [
        {
            Header: translateMethod('Client Id'),
            style: { textAlign: 'left' },
            accessor: item => item.apiKey.clientId,
        },
        {
            Header: translateMethod("Authorized PerSec"),
            accessor: item => (item.quotas || {})["authorizedCallsPerSec"] || "-"
        },
        {
            Header: translateMethod("Remaining PerSec"),
            accessor: item => accessor(item, "remainingCallsPerSec", "authorizedCallsPerSec")
        },
        {
            Header: translateMethod("Aauthorized PerDay"),
            accessor: item => (item.quotas || {})["authorizedCallsPerDay"] || "-"
        },
        {
            Header: translateMethod("Remaining PerDay"),
            accessor: item => accessor(item, "remainingCallsPerDay", "authorizedCallsPerDay")
        },
        {
            Header: translateMethod("Authorized PerMonth"),
            accessor: item => (item.quotas || {})["authorizedCallsPerMonth"] || "-"
        },
        {
            Header: translateMethod("Remaining PerMonth"),
            accessor: item => accessor(item, "remainingCallsPerMonth", "authorizedCallsPerMonth")
        },
    ];

    const params = useParams()

    return (
        <TeamBackOffice
            tab="Quotas"
            apiId={params.apiId}
            title={`${translateMethod('Team Quotas')}`}>
            <Can I={manage} a={apikey} team={currentTeam} dispatchError={true}>
                <Table
                    defaultTitle="Quotas"
                    defaultSort="clientId"
                    itemName="apikey"
                    columns={columns}
                    fetchItems={() => Services.getAllTeamSubscriptions(currentTeam._id)}
                    showActions={false}
                    showLink={false}
                    hideFilter={true}
                    extractKey={(item) => item._id}
                    injectTable={(t) => (table = t)}
                />
            </Can>
        </TeamBackOffice>
    );
}

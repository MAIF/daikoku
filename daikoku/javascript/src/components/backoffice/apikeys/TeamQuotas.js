import React, { useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as Services from '../../../services';
import { TeamBackOffice } from '..';
import { Table } from '../../inputs';
import { Can, manage, apikey } from '../../utils';
import { I18nContext } from '../../../core';
import { useSelector } from 'react-redux'
import { Progress } from 'antd';

export const TeamQuotas = (props) => {
    const { translateMethod, Translation } = useContext(I18nContext);
    let table;

    const { currentTeam } = useSelector((state) => state.context);

    const getValue = (item, remainingName, thresholdName) => {
        const remaining = (item.quotas || {})[remainingName] || 0;
        const threshold = (item.quotas || {})[thresholdName] || 0;

        const r = remaining / threshold * 100

        if (isNaN(r))
            return 0

        return r
    }

    const columns = [
        {
            Header: translateMethod('Client Id'),
            style: { textAlign: 'left' },
            accessor: item => item.apiKey.clientId
        },
        {
            Header: translateMethod("Remaining PerDay"),
            Cell: ({
                cell: {
                    row: { original },
                },
            }) => (
                <Progress
                    status="normal"
                    percent={getValue(original, "remainingCallsPerDay", "authorizedCallsPerDay")}
                    default={'default'}
                    showInfo={true}
                    trailColor={"#ddd"}
                    format={(percent) => `${Math.round(percent)} %`}
                />
            )
        },
        {
            Header: translateMethod("Remaining PerMonth"),
            Cell: ({
                cell: {
                    row: { original },
                },
            }) => (
                <Progress
                    status="normal"
                    percent={getValue(original, "remainingCallsPerMonth", "authorizedCallsPerMonth")}
                    default={'default'}
                    showInfo={true}
                    trailColor={"#ddd"}
                    format={(percent) => `${Math.round(percent || 0)} %`}
                />
            )
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
                    extractKey={(item) => item._id}
                    injectTable={(t) => (table = t)}
                />
            </Can>
        </TeamBackOffice>
    );
}

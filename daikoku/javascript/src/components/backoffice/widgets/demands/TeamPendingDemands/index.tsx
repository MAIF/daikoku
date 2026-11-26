import { useContext } from "react";
import { isError, ITeamSimple } from "../../../../../types";
import { I18nContext, ModalContext } from "../../../../../contexts";
import { GlobalContext } from "../../../../../contexts/globalContext";
import { DynamicTable, DynamicTableFeatures, FetchData } from "../../../../inputs";
import { formatDate } from "../../../../utils";
import { createColumnHelper } from "@tanstack/react-table";
import { QUERY_KEYS } from "../../../../../constants/queryKeys";
import { isWaitingForPayment } from "../currentStep";
import { PendingDemandActions } from "./PendingDemandActions";
import { useQueryClient } from "@tanstack/react-query";
import { cancelProcess, rerunProcess } from "../../../../../services";
import { toast } from "sonner";

const GET_TEAM_PENDING_DEMANDS = `
  query GetTeamPendingDemands($teamId: String!, $limit: Int, $offset: Int) {
    teamSubscriptionDemands(teamId: $teamId, limit: $limit, offset: $offset) {
      total
      subscriptionDemands {
        _id
        api {
          name
        }
        plan {
          customName
        }
        steps {
          state
          step {
            name
          }
        }
        from {
          name
        }
        date
      }
    }
  }
`;

type PendingDemandGql = {
  _id: string;
  api: {
    name: string;
  };
  plan: {
    customName: string;
  };
  steps: Array<{
    state: string;
    step: {
      name: string;
    };
  }>;
  from: {
    name: string;
  };
  date: number;
};

type TeamPendingDemandsGql = {
  teamSubscriptionDemands: {
    total: number;
    subscriptionDemands: Array<PendingDemandGql>;
  };
};

type TeamPendingDemandsProps = {
  team: ITeamSimple;
};

const pendingDemandStateBadge = (demand: PendingDemandGql) => {
  if (isWaitingForPayment(demand.steps)) {
    return {
      className: '--warning',
      labelKey: 'widget.demands.state.payment',
    };
  }

  return {
    className: '--neutral',
    labelKey: 'widget.demands.state.validation',
  };
};

export const TeamPendingDemands = ({ team }: TeamPendingDemandsProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const { connectedUser, customGraphQLClient } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const isTeamAdmin =
    connectedUser.isDaikokuAdmin ||
    team.users.some((member) => member.userId === connectedUser._id && member.teamPermission === 'Administrator');

  const fetchPendingDemands: FetchData<PendingDemandGql> = ({ limit, offset }) =>
    customGraphQLClient
      .request<TeamPendingDemandsGql>(GET_TEAM_PENDING_DEMANDS, {
        teamId: team._id,
        limit,
        // teamSubscriptionDemands reads its offset as a page number, not as a row offset
        offset: offset / limit,
      })
      .then(({ teamSubscriptionDemands }) => ({
        items: teamSubscriptionDemands.subscriptionDemands,
        total: teamSubscriptionDemands.total,
      }));

  const resumePayment = (demand: PendingDemandGql) =>
    rerunProcess(team._id, demand._id).then((response) => {
      if (isError(response)) {
        toast.error(translate(response.error));
      } else {
        window.location.href = response.checkoutUrl;
      }
    });

  const cancelDemand = async (demand: PendingDemandGql) => {
    const confirmed = await confirm({
      title: translate('demand.delete.modal.title'),
      message: translate('demand.delete.modal.message'),
    });

    if (!confirmed) {
      return;
    }

    const response = await cancelProcess(team._id, demand._id);

    if (isError(response)) {
      toast.error(translate(response.error));
    } else {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.teamPendingDemands(team._id) });
    }
  };

  const formatDemandDate = (millis: number) =>
    formatDate(millis, translate('date.locale'), translate('date.format.without.hours'));

  const columnHelper = createColumnHelper<DynamicTableFeatures, PendingDemandGql>();
  const columns = [
    columnHelper.display({
      id: 'api',
      meta: {
        title: translate('widget.demands.table.api'),
        size: 2,
      },
      cell: (info) => info.row.original.api.name,
    }),
    columnHelper.display({
      id: 'plan',
      meta: {
        title: translate('widget.demands.table.plan'),
        size: 2,
      },
      cell: (info) => info.row.original.plan.customName,
    }),
    columnHelper.display({
      id: 'from',
      meta: {
        title: translate('widget.demands.table.from'),
        size: 2,
      },
      cell: (info) => info.row.original.from.name,
    }),
    columnHelper.display({
      id: 'date',
      meta: {
        title: translate('widget.demands.table.date'),
        size: 2,
      },
      cell: (info) => formatDemandDate(info.row.original.date),
    }),
    columnHelper.display({
      id: 'state',
      meta: {
        title: translate('widget.demands.table.state'),
        size: 2,
      },
      cell: (info) => {
        const stateBadge = pendingDemandStateBadge(info.row.original);

        return <span className={`badge ${stateBadge.className}`}>{translate(stateBadge.labelKey)}</span>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      meta: {
        size: 3,
      },
      cell: (info) => (
        <PendingDemandActions
          canResumePayment={isWaitingForPayment(info.row.original.steps)}
          onResumePayment={() => resumePayment(info.row.original)}
          canCancel={isTeamAdmin}
          onCancel={() => cancelDemand(info.row.original)}
        />
      ),
    }),
  ];

  return (
    <section className="flex-grow-1">
      <h4>{translate('widget.demands.title')}</h4>
      <DynamicTable<PendingDemandGql>
        queryKey={QUERY_KEYS.teamPendingDemands(team._id)}
        columns={columns}
        fetchData={fetchPendingDemands}
        pageSize={10}
        persistFiltersInUrl={false}
        getRowId={(demand) => demand._id}
        getRowAriaLabel={(demand) => `${demand.api.name} - ${demand.plan.customName}`}
        emptyState={<div className="alert alert-info">{translate('widget.demands.empty')}</div>}
      />
    </section>
  );
};

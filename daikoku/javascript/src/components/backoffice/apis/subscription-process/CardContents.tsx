import { useContext } from 'react';
import * as Services from '../../../../services';
import type { CardContentProps } from '../../../../modules/flow-editor';
import { I18nContext } from '../../../../contexts/i18n-context';
import type { IValidationStep } from '../../../../types/api';
import './summaries.css';
import { useQuery } from '@tanstack/react-query';
import { isError } from '../../../../types';
import {Spinner} from "../../../utils";

const PillsRow = ({ label, values }: { label: string; values: string[] }) => {
  const { translate } = useContext(I18nContext);
  return (
    <div className="card-summary-row d-flex align-items-baseline">
      <dt className="fw-semibold">{translate(label)}</dt>
      <dd className="m-0 d-flex flex-wrap gap-2">
        {values.filter(Boolean).map((value, index) => (
          <code className="rounded-2" key={`${value}-${index}`}>
            {value}
          </code>
        ))}
      </dd>
    </div>
  );
};

export const HttpCard = ({
  data,
}: CardContentProps<Extract<IValidationStep, { type: 'httpRequest' }>>) => (
  <dl className="card-summary m-0 p-2 d-flex flex-column">
    <PillsRow label="validation.workflow.summary.url" values={[data.url]} />
    <PillsRow label="validation.workflow.summary.headers" values={Object.keys(data.headers)} />
  </dl>
);

export const FormCard = ({
  data,
  hideConfiguration = false,
}: CardContentProps<Extract<IValidationStep, { type: 'form' }>> & {
  hideConfiguration?: boolean;
}) => (
  <>
    <dl className="card-summary m-0 p-2 d-flex flex-column">
      <PillsRow label="validation.workflow.summary.fields" values={Object.keys(data.schema)} />
      {!hideConfiguration && (
        <>
          <PillsRow label="motivation.form.formatter.label" values={[data.formatter]} />
          <PillsRow
            label="motivation.form.formKeysToMetadata.label"
            values={data.formKeysToMetadata ?? []}
          />
        </>
      )}
    </dl>
    {data.info && <p>{data.info}</p>}
  </>
);

export const MailCard = ({
  data,
}: CardContentProps<Extract<IValidationStep, { type: 'email' }>>) => (
  <dl className="card-summary m-0 p-2 d-flex flex-column">
    <PillsRow label="validation.workflow.email.step.emails.label" values={data.emails} />
    <PillsRow label="validation.workflow.email.step.message.label" values={[data.message]} />
  </dl>
);

export const ValidationCard = ({
  data,
}: CardContentProps<Extract<IValidationStep, { type: 'teamAdmin' }>>) => {
  const { data: team, isPending, error } = useQuery({
    queryKey: ['workflow-team', data.team],
    queryFn: async () => {
      const response = await Services.team(data.team);
      if (isError(response)) throw new Error(response.error);
      return response;
    },
  });

  if (isPending) return <Spinner />;
  if (error) return <p role="alert">{error.message}</p>;

  return (
    <dl className="card-summary m-0 p-2 d-flex flex-column">
      <PillsRow
        label="validation.workflow.summary.team"
        values={[team.name]}
      />
    </dl>
  );
};

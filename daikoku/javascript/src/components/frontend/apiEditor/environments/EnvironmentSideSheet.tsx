import { Form, FormRef } from '@maif/react-forms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefObject, useContext, useId, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import { toast } from 'sonner';

import { QUERY_KEYS } from '../../../../constants/queryKeys';
import { I18nContext, ModalContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IApi, isError, ITeamSimple, IUsagePlan, IValidationStep } from '../../../../types';
import { SubscriptionProcessEditor } from '../../../backoffice/apis/SubscriptionProcessEditor';
import { ChoiceChips } from '../../../inputs';
import { InfoCallout, SideSheet, SideSheetActions, Spinner, tabPanelId, Tabs } from '../../../utils';
import { billingSchema, generalSchema, otoroshiSchema, quotasSchema } from './planSchemas';

export type EnvironmentSheetTab = 'settings' | 'general' | 'process';

type EnvironmentSideSheetProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  plan: IUsagePlan;
  creation: boolean;
  initialTab?: EnvironmentSheetTab;
  onClose: () => void;
};

type FormHandle = RefObject<FormRef | undefined>;

const PRICING_FIELDS = ['costPerMonth', 'costPerRequest', 'includedRequestsPerMonth'] as const;

const pricingChanged = (before: IUsagePlan, after: IUsagePlan) =>
  PRICING_FIELDS.some((field) => (before[field] ?? null) !== (after[field] ?? null)) ||
  before.paymentSettings?.thirdPartyPaymentSettingsId !== after.paymentSettings?.thirdPartyPaymentSettingsId;

const NO_PRICING: Partial<IUsagePlan> = {
  costPerMonth: undefined,
  costPerRequest: undefined,
  includedRequestsPerMonth: undefined,
  currency: undefined,
  paymentSettings: undefined,
};

const pricingOf = (plan: IUsagePlan): Partial<IUsagePlan> => ({
  costPerMonth: plan.costPerMonth,
  costPerRequest: plan.costPerRequest,
  includedRequestsPerMonth: plan.includedRequestsPerMonth,
  currency: plan.currency,
  paymentSettings: plan.paymentSettings,
});

export const EnvironmentSideSheet = ({ api, ownerTeam, plan, creation, initialTab, onClose }: EnvironmentSideSheetProps) => {
  const { translate } = useContext(I18nContext);
  const { confirm } = useContext(ModalContext);
  const { tenant } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const hadCustomQuotas = !!(plan.maxPerSecond || plan.maxPerDay || plan.maxPerMonth);
  const wasPaid = plan.costPerMonth != null || plan.costPerRequest != null;

  const [tab, setTab] = useState<EnvironmentSheetTab>(initialTab ?? 'settings');
  const [customQuotas, setCustomQuotas] = useState(hadCustomQuotas);
  const [paid, setPaid] = useState(wasPaid);
  const [process, setProcess] = useState<Array<IValidationStep>>(plan.subscriptionProcess);
  const [saving, setSaving] = useState(false);
  const [persisted, setPersisted] = useState(!creation);
  const [startingPlan, setStartingPlan] = useState(plan);
  const environmentLabelId = useId();

  const byEnvironment = tenant.display === 'environment' && api.visibility !== 'AdminOnly';
  const needsEnvironment = creation && byEnvironment && !tenant.environments.includes(startingPlan.customName);

  const quotasRef: FormHandle = useRef(undefined);
  const billingRef: FormHandle = useRef(undefined);
  const otoroshiRef: FormHandle = useRef(undefined);
  const generalRef: FormHandle = useRef(undefined);

  const availableEnvsQuery = useQuery({
    queryKey: QUERY_KEYS.availableEnvsByApi(api._id),
    queryFn: () => Services.getAllAvailableEnvs(ownerTeam._id, api._id, api.currentVersion),
  });
  const availableEnvs = [
    ...(availableEnvsQuery.data ?? []),
    ...(plan.customName && !creation ? [plan.customName] : []),
  ];

  const paymentEnabledQuery = useQuery({
    queryKey: QUERY_KEYS.paymentEnabled(),
    queryFn: () => Services.getPaymentEnabled(),
  });
  const billedByStripe = !!plan.paymentSettings;
  const paymentAvailable =
    tenant.thirdPartyPaymentSettings.length > 0 && !!paymentEnabledQuery.data && !isError(paymentEnabledQuery.data);

  const otoroshisQuery = useQuery({
    queryKey: ['otoroshis', tenant._id, ownerTeam._id],
    queryFn: () => Services.allSimpleOtoroshis(tenant._id, ownerTeam).then((r) => (isError(r) ? [] : r)),
  });
  const otoroshis = otoroshisQuery.data;

  const otoroshiTarget = useMemo(() => {
    const onlyOtoroshi = otoroshis?.length === 1 ? otoroshis[0]._id : undefined;

    return plan.otoroshiTarget?.otoroshiSettings || !onlyOtoroshi
      ? plan.otoroshiTarget
      : { ...plan.otoroshiTarget, otoroshiSettings: onlyOtoroshi };
  }, [plan, otoroshis]);

  const billingValue = useMemo(() => {
    const [onlyPayment, ...others] = tenant.thirdPartyPaymentSettings;

    return plan.paymentSettings || !onlyPayment || others.length
      ? plan
      : { ...plan, paymentSettings: { thirdPartyPaymentSettingsId: onlyPayment._id, type: onlyPayment.type } };
  }, [plan, tenant]);

  const otoroshi = otoroshiSchema(translate, tenant, ownerTeam, plan, otoroshis ?? []);
  const general = generalSchema(translate, tenant, api, ownerTeam, availableEnvs, confirm);

  const activeForms: Array<{ tab: EnvironmentSheetTab; ref: FormHandle }> = [
    ...(customQuotas ? [{ tab: 'settings' as const, ref: quotasRef }] : []),
    ...(paid ? [{ tab: 'settings' as const, ref: billingRef }] : []),
    { tab: 'settings', ref: otoroshiRef },
    { tab: 'general', ref: generalRef },
  ];

  const valuesOf = (ref: FormHandle) => ref.current?.methods.data() ?? {};

  const isDirty = () =>
    process !== plan.subscriptionProcess ||
    startingPlan !== plan ||
    customQuotas !== hadCustomQuotas ||
    paid !== wasPaid ||
    activeForms.some(({ ref }) => !!ref.current?.methods.formState.isDirty);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.availableEnvsByApi(api._id) }),
      queryClient.invalidateQueries({ queryKey: ['plans'] }),
      queryClient.invalidateQueries({ queryKey: ['api'] }),
    ]);

  const buildPlan = (): IUsagePlan => {
    const general = valuesOf(generalRef);
    const otoroshiTarget = valuesOf(otoroshiRef);
    const aggregation = !!general.aggregationApiKeysSecurity;

    return {
      ...plan,
      ...general,
      ...(customQuotas
        ? valuesOf(quotasRef)
        : { maxPerSecond: undefined, maxPerDay: undefined, maxPerMonth: undefined }),
      ...(paid ? { ...valuesOf(billingRef), currency: { code: 'EUR' } } : NO_PRICING),
      otoroshiTarget: aggregation
        ? {
            ...otoroshiTarget,
            apikeyCustomization: { ...otoroshiTarget.apikeyCustomization, readOnly: false, clientIdOnly: false },
          }
        : otoroshiTarget,
      subscriptionProcess: process,
    };
  };

  const persist = (updated: IUsagePlan) => {
    const needsPaymentSetup = !billedByStripe && pricingChanged(plan, updated);
    const save = persisted
      ? Services.updatePlan(ownerTeam._id, api._id, api.currentVersion, needsPaymentSetup ? { ...updated, ...pricingOf(plan) } : updated)
      : Services.createPlan(ownerTeam._id, api._id, api.currentVersion, needsPaymentSetup ? { ...updated, ...NO_PRICING } : updated);

    return save
      .then((response) => {
        if (isError(response)) {
          throw response;
        }

        setPersisted(true);

        if (!needsPaymentSetup) {
          return;
        }

        const askConfirmation = updated.paymentSettings?.thirdPartyPaymentSettingsId
          ? confirm({
              title: translate('plan.payment.setup.confirm.title'),
              message: translate('plan.payment.setup.confirm.message'),
            })
          : Promise.resolve(true);

        return askConfirmation.then((ok) =>
          ok
            ? Services.setupPayment(ownerTeam._id, api._id, api.currentVersion, updated).then((payment) => {
                if (isError(payment)) {
                  throw payment;
                }
              })
            : undefined
        );
      })
      .then(() => {
        toast.success(
          creation
            ? translate({ key: 'create.plan.successful.toast.label', replacements: [updated.customName] })
            : translate('update.plan.successful.toast.label')
        );
        return refresh().then(onClose);
      })
      .catch((error) => toast.error(translate(error?.error ?? 'issues.on_error')));
  };

  const save = async () => {
    for (const form of activeForms) {
      const valid = await form.ref.current?.methods.trigger();
      if (valid === false) {
        setTab(form.tab);
        return;
      }
    }

    setSaving(true);
    persist(buildPlan()).finally(() => setSaving(false));
  };

  const title = creation
    ? translate(tenant.display === 'environment' ? 'api.editor.environment.create.title' : 'api.home.create.plan.form.title')
    : translate(tenant.display === 'environment' ? 'api.editor.environment.edit.title' : 'api.home.update.plan.form.title');

  if (needsEnvironment) {
    return (
      <SideSheet
        title={title}
        size="wide"
        onClose={onClose}
        footer={(requestClose) => <SideSheetActions onCancel={requestClose} onSave={save} saveDisabled />}
      >
        {availableEnvsQuery.isSuccess && availableEnvs.length === 0 && (
          <InfoCallout>{translate('api.editor.environment.choose.none')}</InfoCallout>
        )}

        {availableEnvs.length > 0 && (
          <>
            <label id={environmentLabelId} className="form-label">
              {translate('api.editor.environment.choose.label')}
            </label>
            <Select
              aria-labelledby={environmentLabelId}
              classNamePrefix="reactSelect"
              placeholder={translate('Select')}
              options={availableEnvs.map((name) => ({ label: name, value: name }))}
              value={null}
              onChange={(option) => option && setStartingPlan({ ...plan, customName: option.value })}
            />
          </>
        )}
      </SideSheet>
    );
  }

  return (
    <SideSheet
      title={title}
      size="wide"
      onClose={onClose}
      isDirty={isDirty}
      footer={(requestClose) => (
        <SideSheetActions onCancel={requestClose} onSave={save} saveDisabled={saving || !otoroshis} />
      )}
    >
      <Tabs
        idPrefix="environment-sheet"
        label={title}
        variant="segmented"
        activeTab={tab}
        onChange={setTab}
        tabs={[
          { id: 'settings', label: translate('api.editor.environment.tab.settings') },
          { id: 'general', label: translate('api.editor.environment.tab.general') },
          { id: 'process', label: translate('api.editor.environment.tab.process') },
        ]}
      />

      <div role="tabpanel" id={tabPanelId('environment-sheet', 'settings')} hidden={tab !== 'settings'}>
        <h3>{translate('api.pricings.quotas.table.title')}</h3>
        <ChoiceChips
          label={translate('api.editor.environment.quotas.label')}
          options={[
            { value: false, label: translate('api.editor.environment.quotas.unlimited') },
            { value: true, label: translate('api.editor.environment.quotas.custom') },
          ]}
          value={customQuotas}
          onChange={setCustomQuotas}
        />
        <div className="my-3">
          <InfoCallout>
            {translate(customQuotas ? 'usage.plan.form.quotas.selector.true.description' : 'usage.plan.form.quotas.selector.false.description')}
          </InfoCallout>
        </div>
        {customQuotas && <Form ref={quotasRef} schema={quotasSchema(translate, plan)} value={plan} onSubmit={() => {}} footer={() => <></>} />}

        <h3>{translate('api.pricings.pricing.table.title')}</h3>
        <ChoiceChips
          label={translate('api.pricings.pricing.table.title')}
          options={[
            { value: false, label: translate('api.editor.environment.pricing.free') },
            { value: true, label: translate('api.editor.environment.pricing.paid') },
          ]}
          value={paid}
          onChange={setPaid}
          disabled={billedByStripe || (!paid && !paymentAvailable)}
        />
        <div className="my-3">
          <InfoCallout>
            {billedByStripe && translate('usage.plan.form.pricing.stripe.locked')}
            {!billedByStripe && !paymentAvailable && translate('usage.plan.form.pricing.payment.unavailable')}
            {!billedByStripe &&
              paymentAvailable &&
              translate(paid ? 'usage.plan.form.pricing.selector.true.description' : 'usage.plan.form.pricing.selector.false.description')}
          </InfoCallout>
        </div>
        {paid && (
          <Form
            ref={billingRef}
            schema={billingSchema(translate, tenant, plan)}
            value={billingValue}
            onSubmit={() => {}}
            footer={() => <></>}
          />
        )}

        <h3>{translate('api.pricings.otoroshi.target.table.title')}</h3>
        {!otoroshis && <Spinner />}
        {otoroshis && (
          <Form
            ref={otoroshiRef}
            schema={otoroshi.schema}
            flow={otoroshi.flow}
            value={otoroshiTarget}
            onSubmit={() => {}}
            footer={() => <></>}
          />
        )}
      </div>

      <div role="tabpanel" id={tabPanelId('environment-sheet', 'general')} hidden={tab !== 'general'}>
        <Form
          ref={generalRef}
          schema={general.schema}
          flow={general.flow}
          value={startingPlan}
          onSubmit={() => {}}
          footer={() => <></>}
        />
      </div>

      <div role="tabpanel" id={tabPanelId('environment-sheet', 'process')} hidden={tab !== 'process'}>
        <SubscriptionProcessEditor process={process} onChange={setProcess} team={ownerTeam._id} tenant={tenant} />
      </div>
    </SideSheet>
  );
};

import { CodeInput, constraints, Form, format, Schema, type } from '@maif/react-forms';
import { nanoid } from 'nanoid';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { CreditCard, Globe, FileText, Mail, ShieldCheck, Flag, KeyRound } from 'lucide-react';

import { toast } from 'sonner';
import { I18nContext } from '../../../contexts/i18n-context';
import { ModalContext } from '../../../contexts/modalContextInstance';
import { IValidationStep } from '../../../types/api';
import { ITenant } from '../../../types/tenant';
import { insertArrayIndex } from '../../utils/array';
import { Help } from '../apikeys';
import { CardTypeCatalog, FlowEditor } from '../../../modules/flow-editor';
import { FormCard, HttpCard, MailCard, ValidationCard } from './subscription-process/CardContents';

type MotivationFormProps = {
  saveMotivation: (m: { schema: Schema; formatter: string, formKeysToMetadata?: Array<string>, info?: string }) => void;
  value: IValidationStep & { type: 'form' };
};

const MotivationForm = (props: MotivationFormProps) => {
  const [schema, setSchema] = useState<string | Schema>(
    props.value.schema || '{}'
  );
  const [realSchema, setRealSchema] = useState<any>(props.value.schema || {});
  const [formatter, setFormatter] = useState(props.value.formatter || '');
  const [formKeysToMetadata, setFormKeysToMetadata] = useState<Array<string>>(props.value.formKeysToMetadata || [])
  const [value, setValue] = useState<any>({});
  const [example, setExample] = useState('');
  const [info, setInfo] = useState(props.value.info)

  const { translate } = useContext(I18nContext);
  const { close } = useContext(ModalContext);

  const childRef = useRef<WrapperError | null>(null);
  const codeInputRef = useRef(null);

  useEffect(() => {
    //@ts-ignore
    if (codeInputRef.current.hasFocus) {
      let maybeFormattedSchema = schema;
      try {
        maybeFormattedSchema =
          typeof schema === 'object' ? schema : JSON.parse(schema);
        childRef?.current?.reset();
      } catch { }
      setRealSchema(maybeFormattedSchema || {});
    }
  }, [schema]);

  useEffect(() => {
    const regexp = /\[\[(.+?)\]\]/g;
    const matches = formatter.match(regexp);

    const result = matches?.reduce((acc, match) => {
      const key = match.replace('[[', '').replace(']]', '');
      return acc.replace(match, value[key] || match);
    }, formatter);

    setExample(result || formatter);
  }, [value, formatter]);

  return (
    <>
      <div className="container">
        <div className="row">
          <div className="col-12">
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.info.label')}</label>
              <Help message={translate('motivation.form.info.help')} />
              <CodeInput
                mode="javascript"
                onChange={setInfo}
                value={props.value.info}
              />
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-6">
            <h6>{translate('motivation.form.setting.title')}</h6>
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.schema.label')}</label>
              <Help message={translate('motivation.form.schema.help')} />
              <CodeInput
                mode="javascript"
                onChange={(e) => {
                  setSchema(e);
                }}
                value={
                  typeof schema === 'object'
                    ? JSON.stringify(schema, null, 2)
                    : schema
                }
                setRef={(ref) => (codeInputRef.current = ref)}
              />
            </div>
            <div className="motivation-form__editor mb-1">
              <label>{translate('motivation.form.formatter.label')}</label>
              <Help message={translate('motivation.form.formatter.help')} />
              <CodeInput
                mode="markdown"
                onChange={(e) => {
                  setFormatter(e);
                }}
                value={formatter}
              />
            </div>
          </div>
          <div className="col-6 d-flex flex-column">
            <div className="flex-1">
              {/* @ts-ignore */}
              <WrapperError ref={childRef}>
                <h6>{translate('motivation.form.preview.title')}</h6>
                <i>{translate('motivation.form.sample.help')}</i>
                <Form
                  schema={realSchema}
                  onSubmit={setValue}
                  options={{
                    actions: {
                      submit: {
                        label: translate('motivation.form.sample.button.label'),
                      },
                    },
                  }}
                />
              </WrapperError>
            </div>
            <div className="flex-1">
              <div>{translate('motivation.form.sample.title')}</div>
              <div>{example}</div>
            </div>
            <div className="flex-1 mt-1">
              <div>
                <Form
                  schema={{
                    formKeysToMetadata: {
                      type: type.string,
                      isMulti: true,
                      format: format.select,
                      options: Object.keys(realSchema),
                      label: translate('motivation.form.formKeysToMetadata.label')
                    }
                  }}
                  onSubmit={d => {
                      setFormKeysToMetadata(d.formKeysToMetadata);
                  }}
                  value={{ formKeysToMetadata: formKeysToMetadata }}
                  options={{ autosubmit: true, actions: { submit: { display: false } } }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <button
          className="btn --primary"
          onClick={() => {
            props.saveMotivation({ schema: realSchema, formatter, formKeysToMetadata, info });
            close();
          }}
        >
          {translate('Save')}
        </button>
      </div>
    </>
  );
};

type ValidationStepProps = {
  step: Extract<IValidationStep, { type: 'payment' }>;
  tenant: ITenant;
  index: number;
};

const PaymentStep = (props: ValidationStepProps) => {
  const step = props.step;
  switch (step.type) {
    case 'payment':
      const thirdPartyPaymentSettings =
        props.tenant.thirdPartyPaymentSettings.find(
          (setting) => setting._id == step.thirdPartyPaymentSettingsId
        );
      return (
        <div className="d-flex flex-column validation-step">
          <span className="validation-step__index">
            {String(props.index).padStart(2, '0')}
          </span>
          <span className="validation-step__name">{step.title}</span>
          <span className="validation-step__type">
            <CreditCard />
          </span>
          <div className="d-flex flex-row validation-step__infos">
            <span>{thirdPartyPaymentSettings?.name}</span>
            <span>{thirdPartyPaymentSettings?.type}</span>
          </div>
        </div>
      );
  }
};

type EmailOption = { option: 'all' | 'oneOf' };

type SubProcessProps = {
  save: (process: Array<IValidationStep>) => Promise<void>;
  process: Array<IValidationStep>;
  team: string;
  tenant: ITenant;
  documentation?: React.ComponentType<{ close: () => void, updateProcess: (process: IValidationStep[]) => void }>
};
type IValidationStepEmail = IValidationStep & { type: 'email' };
type IValidationStepForm = IValidationStep & { type: 'form' };
type IValidationStepTeamAdmin = IValidationStep & { type: 'teamAdmin' };
type IValidationStepHttpRequest = IValidationStep & { type: 'httpRequest' };

export const SubscriptionProcessEditor = (props: SubProcessProps) => {
  const { translate } = useContext(I18nContext);
  const { openCustomModal, openFormModal, close } = useContext(ModalContext);

  const [draft, setDraft] = useState(props.process)
  const [showDocumentation, setShowDocumentation] = useState(false);

  const editProcess = (name: IValidationStep['type'], index: number) => {
    //todo: use the index !!
    switch (name) {
      case 'email':
        return openFormModal({
          title: translate('subscription.process.add.email.step.title'),
          schema: {
            title: {
              type: type.string,
              label: translate('subscription.process.email.step.title.label'),
              defaultValue: translate('subscription.process.email.step.title.defaultValue'),
              constraints: [
                constraints.required(translate('constraints.required.value')),
              ],
            },
            emails: {
              type: type.string,
              format: format.email,
              label: translate('subscription.process.email.step.emails.label'),
              array: true,
              constraints: [
                constraints.required(translate('constraints.required.value')),
                constraints.email(translate('constraints.matches.email')),
              ],
            },
            option: {
              type: type.string,
              format: format.buttonsSelect,
              options: ['all', 'oneOf'],
              defaultValue: 'oneOf',
              visible: ({ rawValues }) => {
                return rawValues.emails && rawValues.emails.length > 1;
              },
            },
            message: {
              type: type.string,
              label: translate('subscription.process.email.step.message.label'),
              format: format.text,
            },
          },
          onSubmit: (data: IValidationStep & { type: 'email' } & EmailOption) => {
            if (data.option === 'oneOf') {
              const step: IValidationStepEmail = {
                type: 'email',
                emails: data.emails,
                message: data.message,
                id: nanoid(32),
                title: data.title,
              };
              setDraft(current => insertArrayIndex(step, current, index));
            } else {
              const steps: Array<IValidationStepEmail> = data.emails.map(
                (email) => ({
                  type: 'email',
                  emails: [email],
                  message: data.message,
                  id: nanoid(32),
                  title: data.title,
                })
              );
              setDraft(current => steps.reduce(
                (process, step) => insertArrayIndex(step, process, index),
                current
              ));
            }
          },
          options: {
            actions: {
              add: {
                label: translate('subscription.process.email.step.add.label')
              }
            }
          },
          actionLabel: translate('Create'),
        });
      case 'form': {
        const step: IValidationStepForm = {
          type: 'form',
          id: nanoid(32),
          title: 'Form',
          schema: {
            motivation: {
              type: type.string,
              format: format.text,
              constraints: [{ type: 'required' }],
            },
          },
          formatter: '[[motivation]]',
        };
        setDraft(current => [step, ...current])
        return close();
      }
      case 'teamAdmin': {
        const step: IValidationStepTeamAdmin = {
          type: 'teamAdmin',
          team: props.team,
          id: nanoid(32),
          title: 'Admin',
        };
        if (draft.some(e => e.type === 'form')) {
          setDraft(current => [step, ...current])
        } else {
          const formStep: IValidationStepForm = {
            type: 'form',
            id: nanoid(32),
            title: 'Form',
            schema: {
              motivation: {
                type: type.string,
                format: format.text,
                constraints: [{ type: 'required' }],
              },
            },
            formatter: '[[motivation]]',
          };
          toast.info('on a ajouté un step form, obligatoire pour le bon fonctionnement du step admin')
          setDraft(current => [formStep, step, ...current])
        }
        return close();
      }

      case 'httpRequest': {
        const step: IValidationStepHttpRequest = {
          type: 'httpRequest',
          id: nanoid(32),
          title: 'Admin',
          url: 'https://changeit.io',
          headers: {},
        };

        return openFormModal({
          title: translate('subscription.process.add.httpRequest.step.title'),
          schema: {
            title: {
              type: type.string,
              defaultValue: 'HttpRequest',
              constraints: [
                constraints.required(translate('constraints.required.value')),
              ],
            },
            url: {
              type: type.string,
              constraints: [
                constraints.required(translate('constraints.required.value')),
                // constraints.url(translate('constraints.matches.url')),
              ],
            },
            headers: {
              type: type.object,
              defaultValue: {},
            },
          },
          value: step,
          onSubmit: (data: IValidationStepHttpRequest) => {
            setDraft(current => insertArrayIndex(data, current, index));
          },
          actionLabel: translate('Create'),
        });
      }
    }
  };

  const editMailStep = (value: IValidationStepEmail) => {
    return openFormModal({
      title: translate('subscription.process.update.email.step.title'),
      schema: {
        emails: {
          type: type.string,
          array: true,
        },
        message: {
          type: type.string,
          format: format.text,
        },
      },
      onSubmit: (data: IValidationStepEmail) => {
        setDraft(current => current.map((p) => {
          if (p.id === data.id) {
            return data;
          }
          return p;
        }));
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  const editHttpRequestStep = (value: IValidationStepHttpRequest) => {
    return openFormModal({
      title: translate('subscription.process.update.email.step.title'),
      schema: {
        title: {
          type: type.string,
          constraints: [
            constraints.required(translate('constraints.required.value')),
          ],
        },
        url: {
          type: type.string,
          constraints: [
            constraints.required(translate('constraints.required.value')),
            // constraints.url(translate('constraints.matches.url')),
          ],
        },
        headers: {
          type: type.object,
        },
      },
      onSubmit: (data: IValidationStepHttpRequest) => {
        setDraft(current => current.map((p) => {
          if (p.id === data.id) {
            return data;
          }
          return p;
        }));
      },
      actionLabel: translate('Update'),
      value,
    });
  };

  const editFormStep = (item: IValidationStepForm) => openCustomModal({
    title: translate('motivation.form.modal.title'),
    content: (
      <MotivationForm
        value={item}
        saveMotivation={changes => setDraft(current =>
          current.map(step => step.id === item.id ? { ...item, ...changes } : step)
        )}
      />
    ),
  });

  const cardTypes: CardTypeCatalog<IValidationStep> = {
    email: {
      label: translate('subscription.process.email'),
      icon: <Mail size={20} />,
      getTitle: step => step.title,
      Content: MailCard,
      onEdit: editMailStep,
    },
    httpRequest: {
      label: translate('subscription.process.httpRequest'),
      icon: <Globe size={20} />,
      getTitle: step => step.title,
      Content: HttpCard,
      onEdit: editHttpRequestStep,
    },
    form: {
      label: translate('subscription.process.form'),
      icon: <FileText size={20} />,
      getTitle: step => step.title,
      Content: FormCard,
      onEdit: editFormStep,
      canAdd: !draft.some(step => step.type === 'form'),
      canMove: false,
      canDelete: false,
    },
    teamAdmin: {
      label: translate('subscription.process.team.admin'),
      icon: <ShieldCheck size={20} />,
      getTitle: step => step.title,
      Content: ValidationCard,
      canAdd: !draft.some(step => step.type === 'teamAdmin'),
    },
    payment: {
      label: translate('Payment'),
      icon: <CreditCard size={20} />,
      getTitle: step => step.title,
      Content: ({ data }) => <PaymentStep
        step={data}
        tenant={props.tenant}
        index={draft.findIndex(step => step.id === data.id) + 1}
      />,
      canAdd: false,
    },
  };

  const Documentation = props.documentation ?? React.Fragment
  return (
    <div>
      {props.documentation && <button
        className='btn --secondary mb-5'
        onClick={() => setShowDocumentation(!showDocumentation)}>
        {translate(`tenant.security.account.creation.process.doc.${showDocumentation ? 'close' : 'open'}.aria`)}
      </button>}
      {!draft.length && <p>{translate('api.pricings.no.step.explanation')}</p>}
      <FlowEditor<IValidationStep>
        value={draft}
        onChange={setDraft}
        onAdd={editProcess}
        cardTypes={cardTypes}
        start={<span className="badge rounded-pill bg-light text-dark border p-2">
          <Flag size={15} aria-hidden="true" /> {translate('subscription.process.start')}
        </span>}
        end={<span className="badge rounded-pill bg-light text-dark border p-2">
          <KeyRound size={15} aria-hidden="true" /> {translate('subscription.process.end')}
        </span>}
      />
      {showDocumentation && <Documentation close={() => setShowDocumentation(false)} updateProcess={(steps) => setDraft(steps)} />}
      {(!!draft.length || !!props.process.length) && (
        <button className='btn --primary' onClick={() => props.save(draft)}>save</button>
      )}
    </div>
  );
};

export class WrapperError extends React.Component {
  state = {
    error: undefined,
  };

  componentDidCatch(error) {
    this.setState({ error });
  }

  reset() {
    this.setState({ error: undefined });
  }

  render() {
    if (this.state.error) return <div>Something wrong happened</div>; //@ts-ignore
    return this.props.children;
  }
}

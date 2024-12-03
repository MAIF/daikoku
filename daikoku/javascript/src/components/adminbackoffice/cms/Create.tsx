import { useContext, useEffect, useState } from 'react';
import { I18nContext } from '../../../contexts';
import { useNavigate, useParams } from 'react-router-dom';
import * as Services from '../../../services';
import { getApolloContext } from '@apollo/client';

import { Spinner } from '../../utils/Spinner';
import { Form, format, type } from '@maif/react-forms';

export const Create = (props: any) => {
  const { client } = useContext(getApolloContext());
  const { translate } = useContext(I18nContext);

  const params = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  const [value, setValue] = useState<any>({});
  // const [contentType, setContentType] = useState();

  useEffect(() => {
    const id = params.id;
    if (id) {
      setLoading(true);
      client && client.query({ query: Services.graphql.getCmsPage(id) }).then((res) => {
        if (res.data) {
          const { history, ...side } = res.data.cmsPage;
          setValue(side.body);
          // setContentType(side.contentType);
        }
        setLoading(false);
      });
    }
  }, [params.id]);


  if (loading) {
    return <Spinner />;
  }

  const schema = {
    content: {
      label: translate('cms.create.content'),
      type: type.string,
      format: format.code
    }
  }
  const flow = ['content']

  return <>
    <button className="btn btn-sm btn-outline-info my-3" style={{ flex: 1 }} type="button"
      onClick={() => navigate('/settings/pages', { state: { reload: true } })}>
      {translate('cms.create.back_to_pages')}
    </button>
    <Form
      schema={schema}
      flow={flow}
      value={{ content: value }}
      footer={() => <></>}
      onSubmit={() => { }} />
  </>
};

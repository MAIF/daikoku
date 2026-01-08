import { useQuery } from '@tanstack/react-query';
import classNames from 'classnames';
import { useContext } from 'react';
import { Spinner } from './Spinner';

import { GlobalContext } from '../../contexts/globalContext';
import { converter } from '../../services/showdown';
import { ICmsPageGQL, isError } from '../../types';
import { CmsViewer } from '../frontend/CmsViewer';

export const Footer = (props: { isBackOffice: boolean }) => {

  const { tenant, customGraphQLClient } = useContext(GlobalContext)

  const getFooter = `
    query CmsPage($name: String!) {
      page(name: $name) {
        id
        name
        path
      }
    }
  `;
  const pageRequest = useQuery({
    queryKey: ["footer-cms-page"],
    queryFn: () => customGraphQLClient.request<{ page: ICmsPageGQL }>(getFooter, { name: 'footer.html' }),
  })
  

  if (pageRequest.isLoading) {
    return <Spinner />
  } else if (pageRequest.data?.page && !isError(pageRequest.data)) {
    return (
      <CmsViewer className='footer row mt-2' pageId={pageRequest.data.page.id} />
    )

  } else if (!isError(pageRequest)) {
    return null;
  }

};

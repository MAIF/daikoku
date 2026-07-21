import { nanoid } from 'nanoid';
import { PropsWithChildren } from 'react';
import { PlacesType, Tooltip as ReactToolTip, VariantType } from 'react-tooltip';

type BeautifulTitleProps = {
  title: string,
  place?: PlacesType,
  variant?: VariantType,
  className?: string,
  style?: object
  html?: boolean
}

export const BeautifulTitle = ({
  title,
  html,
  place,
  variant,
  ...props
}: PropsWithChildren<BeautifulTitleProps>) => {
  const id: string = nanoid(4);
  return (
    <>
      <ReactToolTip className='bf-tooltip' data-tooltip-id={`tooltip-${id}`} place={place || 'bottom'} variant={variant || 'dark'} />
      {!html && <span id={`tooltip-${id}`} {...props} data-tooltip-content={title} >
        {props.children}
      </span>}
      {html && <span id={`tooltip-${id}`} {...props} data-tooltip-html={title} >
        {props.children}
      </span>}
    </>
  );
};


import { JSX } from 'react';
import { IModalProps } from './ApiSelectModal';
import { IBaseModalProps } from './types';
import { useNavigate } from 'react-router-dom';

type Item = {
  label: string,
  action: (() => void) | string,
}

export interface ISearchModalProps {
  items: Array<Item>,
}
export const SearchModal = ({
  items,
  close,
}: ISearchModalProps & IBaseModalProps) => {
  const navigate = useNavigate()

  const handleItemClick = (item: Item) => {
    switch (typeof item.action) {
      case "string":
        navigate(item.action)
        close()
        break;
      case 'function':
        item.action()
        close()
        break;
    }
  }

  return (
    <div className="modal-content">
      <div className="modal-header">
        <h5 className="modal-title" id="modal-title">Rechercher</h5>
        <button type="button" className="btn-close" aria-label="Close" onClick={() => close()} />
      </div>
      <div className="modal-body">
        {
          items.map((item, idx) => {
            return (<div key={idx} className='cursor-pointer' onClick={() => handleItemClick(item)}>{item.label}</div>)
          })
        }
      </div>
    </div>
  );
};

import classNames from "classnames";
import { GlobalContext } from "../../../contexts/globalContext";
import { useContext, useState } from "react";
import { I18nContext } from "../../../contexts";

type StarButtonProps = {
  toggleStar: () => Promise<any>
  starred: boolean
  classnames?: string
}
const StarsButton = ({ toggleStar, starred, classnames }: StarButtonProps) => {
  const { connectedUser } = useContext(GlobalContext)
  const { translate } = useContext(I18nContext)

  const [star, setStar] = useState(starred)

  if (connectedUser && !connectedUser.isGuest) {
    return (
      <button
        className={`favorite-btn ${classnames ?? ''}`}
        style={{background: 'none', border: 'none'}}
        aria-label={translate(star ? "api.home.remove.api.to.favorite" : "api.home.add.api.to.favorite")}
        onClick={() => toggleStar().then(() => setStar(!star))}
      >
        <i className={classNames('fa-star', {
          'fas': star,
          'far': !star,
        })} />
      </button>
    )
  }
}

export default StarsButton;

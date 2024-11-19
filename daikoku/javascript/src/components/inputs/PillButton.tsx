import classNames from "classnames";

function PillContainer({ children, className, style }) {

  return <div className={`pill-button ${className}`}>
    <div
      className="pill-container"
      style={{
        ...style,
      }}
    >
      {children}
    </div>
  </div>
}

function PillSide({ enabled, pillButtonStyle, onClick, text }) {
  return <button
    className={classNames('pill-mode')}
    type="button"
    style={{
      ...pillButtonStyle,
      color: !enabled ? '#fff' : "#000"
    }}
    onClick={onClick}
  >
    {text}
  </button>
}

function PillCursor({ rightEnabled }) {
  return <div className={classNames(
    'pill-cursor', {
    'pill-mode-right': !rightEnabled
  })} />
}

export function PillButton({
  rightEnabled,
  onChange,
  leftText,
  onLeftClick,
  rightText,
  onRightClick,
  style = {},
  className = '',
  pillButtonStyle = {},
  large
}) {
  return (
    <PillContainer style={style} className={className}>
      <PillCursor rightEnabled={rightEnabled} />
      <PillSide
        enabled={!rightEnabled}
        text={leftText}
        onClick={() => (onLeftClick ? onLeftClick() : onChange(true))}
        pillButtonStyle={pillButtonStyle} />

      <PillSide
        enabled={rightEnabled}
        text={rightText}
        onClick={() => (onRightClick ? onRightClick() : onChange(false))}
        pillButtonStyle={pillButtonStyle} />
    </PillContainer>
  );
}

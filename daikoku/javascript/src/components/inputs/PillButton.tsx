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
}) {
  return (
    <div className={`d-flex ${className}`} style={{ border: '1px solid #fff', width: 'fit-content', borderRadius: '24px', background: '#fff' }}>
      <div
        className="p-1"
        style={{
          borderRadius: '24px',
          backgroundColor: "var(--level2_bg-color, #e5e7ea)",
          color: "var(--level2_text-color, #4c4c4d)",
          position: 'relative',
          width: 'fit-content',
          ...style,
        }}
      >
        <div className={`pill-cursor ${rightEnabled ? '' : 'pill-mode-right'}`} />
        <button
          className="pill-mode"
          type="button"
          style={pillButtonStyle}
          onClick={() => (onLeftClick ? onLeftClick() : onChange(true))}
        >
          {leftText}
        </button>
        <button
          className="pill-mode"
          type="button"
          style={pillButtonStyle}
          onClick={() => (onRightClick ? onRightClick() : onChange(false))}
        >
          {rightText}
        </button>
      </div>
    </div>
  );
}

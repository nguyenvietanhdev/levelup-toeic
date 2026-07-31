// Shared stateless toggle switch, extracted verbatim from SettingsScreen.
export default function Toggle({ checked, onChange }) {
    return (
        <label className="toggle-switch">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className="toggle-slider"></span>
        </label>
    );
}

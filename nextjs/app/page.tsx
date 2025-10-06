export default function Home() {
  return (
    <div className="container">
      <h1>📅 Calendar Merge Service</h1>
      <p className="subtitle">
        Sync multiple Google Calendars into one master calendar
      </p>

      {/* Step 1: Connect Google */}
      <div className="step" id="step1">
        <h2>Step 1: Connect Your Google Account</h2>
        <p>Grant access to your Google Calendars to enable syncing.</p>
        <button className="btn" id="connectBtn">Connect Google Calendar</button>
        <div className="status" id="authStatus"></div>
      </div>

      {/* Step 2: Select Calendars */}
      <div className="step hidden" id="step2">
        <h2>Step 2: Select Source Calendars</h2>
        <p>Choose which calendars you want to merge.</p>
        <div className="loading" id="loadingCalendars">
          Loading your calendars...
        </div>
        <div className="calendar-list hidden" id="calendarList"></div>
      </div>

      {/* Step 3: Choose Target */}
      <div className="step hidden" id="step3">
        <h2>Step 3: Choose Target Calendar</h2>
        <p>Select where merged events should appear.</p>

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="radio"
              name="targetOption"
              value="existing"
              defaultChecked
              style={{ marginRight: "8px" }}
            />
            <span>Use existing calendar</span>
          </label>
        </div>

        <select id="targetCalendar" style={{ marginBottom: "15px" }}>
          <option value="">Select target calendar...</option>
        </select>

        <div style={{ marginBottom: "15px" }}>
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="radio"
              name="targetOption"
              value="new"
              style={{ marginRight: "8px" }}
            />
            <span>Create new calendar</span>
          </label>
        </div>

        <input
          type="text"
          id="newCalendarName"
          placeholder="Enter new calendar name"
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "6px",
            display: "none",
            marginBottom: "15px",
          }}
        />

        <button className="btn" id="setupBtn" disabled>Start Syncing</button>
        <div className="status" id="setupStatus"></div>
      </div>
    </div>
  );
}

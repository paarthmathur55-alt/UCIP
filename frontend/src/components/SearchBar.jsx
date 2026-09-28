import { useState } from "react";

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState("");

  function submit(e) {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim());
  }

  return (
    <form className="search-bar" onSubmit={submit}>
      <input
        id="dashboard-search-input"
        type="text"
        aria-label="Search for a plate or person tag"
        placeholder="Search plate or person tag (e.g. DL8CAF1234)…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" aria-label="Track the selected plate or person">Track</button>
      {value && (
        <button type="button" className="btn btn-ghost" aria-label="Clear search" onClick={() => { setValue(""); onSearch(null); }}>
          Clear
        </button>
      )}
    </form>
  );
}

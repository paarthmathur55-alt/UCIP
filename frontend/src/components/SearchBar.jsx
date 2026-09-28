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
        type="text"
        placeholder="Search plate or person tag (e.g. DL8CAF1234)…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn btn-primary" type="submit">Track</button>
      {value && (
        <button type="button" className="btn btn-ghost" onClick={() => { setValue(""); onSearch(null); }}>
          Clear
        </button>
      )}
    </form>
  );
}

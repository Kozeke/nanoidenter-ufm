const DisplayErrors = ({ errors }) => {
  if (!errors || errors.length === 0) return null;
  return (
    <div style={{ color: "red", fontSize: "12px", marginTop: "8px" }}>
      <strong>Errors:</strong>
      <ul>
        {errors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    </div>
  );
};

export default DisplayErrors;
import { useEffect, useRef } from "react";

const STATUS_COLORS = {
  online: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
};

/**
 * SIMULATED VIDEO FEED
 * ====================
 * This project runs without Docker, so there is no MediaMTX/RTSP bridge in
 * this build — hooking up real camera video would require external native
 * binaries (ffmpeg + a media server) installed on your machine.
 *
 * This tile renders an animated illustrated street scene with moving objects,
 * a sweeping scanner, and a tracking box that follows the latest synthetic
 * detection. It is an intentionally simulated visual, not camera footage.
 *
 * SWAP-IN POINT: replace the <canvas> below with a <video> tag pointed at an
 * HLS/WebRTC URL from a real RTSP bridge (see ARCHITECTURE_AND_WORKFLOW.md
 * §4) and this component's props/behavior stay the same.
 */
export default function VideoTile({ camera, lastDetection }) {
  const canvasRef = useRef(null);
  const detectionRef = useRef(lastDetection);
  detectionRef.current = lastDetection;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let t = 0;

    function drawVehicle(x, y) {
      ctx.fillStyle = "rgba(2, 8, 23, 0.5)";
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 23, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e3a5f";
      ctx.beginPath();
      ctx.moveTo(x - 20, y + 1);
      ctx.lineTo(x - 14, y - 7);
      ctx.lineTo(x + 8, y - 7);
      ctx.lineTo(x + 18, y - 1);
      ctx.lineTo(x + 22, y + 5);
      ctx.lineTo(x + 19, y + 8);
      ctx.lineTo(x - 19, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(x - 10, y - 6, 12, 6);
      ctx.fillStyle = "#bae6fd";
      ctx.fillRect(x + 3, y - 5, 6, 5);
      ctx.fillStyle = "#020617";
      ctx.beginPath();
      ctx.arc(x - 12, y + 7, 3, 0, Math.PI * 2);
      ctx.arc(x + 13, y + 7, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawPerson(x, y) {
      ctx.fillStyle = "rgba(2, 8, 23, 0.45)";
      ctx.beginPath();
      ctx.ellipse(x, y + 3, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(x, y - 19, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fb923c";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x, y - 3);
      ctx.stroke();
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x - 5, y + 2);
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x + 5, y + 2);
      ctx.moveTo(x, y - 11);
      ctx.lineTo(x - 6, y - 7);
      ctx.moveTo(x, y - 11);
      ctx.lineTo(x + 6, y - 7);
      ctx.stroke();
    }

    function drawTargetBox(x, y, boxWidth, boxHeight, label, color) {
      const left = x - boxWidth / 2;
      const top = y - boxHeight / 2;
      ctx.fillStyle = `${color}18`;
      ctx.fillRect(left, top, boxWidth, boxHeight);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(left, top, boxWidth, boxHeight);
      ctx.setLineDash([]);

      const corner = 7;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(left, top + corner); ctx.lineTo(left, top); ctx.lineTo(left + corner, top);
      ctx.moveTo(left + boxWidth - corner, top); ctx.lineTo(left + boxWidth, top); ctx.lineTo(left + boxWidth, top + corner);
      ctx.moveTo(left, top + boxHeight - corner); ctx.lineTo(left, top + boxHeight); ctx.lineTo(left + corner, top + boxHeight);
      ctx.moveTo(left + boxWidth - corner, top + boxHeight); ctx.lineTo(left + boxWidth, top + boxHeight); ctx.lineTo(left + boxWidth, top + boxHeight - corner);
      ctx.stroke();

      ctx.font = "bold 9px monospace";
      const tag = label.length > 23 ? `${label.slice(0, 20)}…` : label;
      const tagWidth = Math.min(ctx.measureText(tag).width + 12, 180);
      const tagX = Math.max(4, Math.min(left, canvas.width - tagWidth - 4));
      const tagY = Math.max(33, top - 15);
      ctx.fillStyle = color;
      ctx.fillRect(tagX, tagY, tagWidth, 14);
      ctx.fillStyle = "#07111e";
      ctx.fillText(tag, tagX + 6, tagY + 10);
    }

    function draw() {
      const { width, height } = canvas;
      const detection = detectionRef.current;
      const isVehicle = detection
        ? detection.entity_type === "vehicle_plate"
        : Math.floor(t / 300) % 2 === 0;
      const targetColor = detection ? "#22d3ee" : "#38bdf8";
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#101d33");
      sky.addColorStop(0.48, "#17304a");
      sky.addColorStop(0.49, "#15253a");
      sky.addColorStop(1, "#08111d");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      if (camera.status !== "offline") {
        // Distant skyline and lit windows create a miniature scene in place
        // of a blank grid.
        const buildings = [
          [0, 45, 43, 66], [37, 30, 38, 82], [72, 52, 31, 60],
          [216, 40, 37, 72], [250, 24, 38, 88], [286, 47, 34, 65],
        ];
        buildings.forEach(([x, y, w, h], index) => {
          ctx.fillStyle = index % 2 ? "#15243a" : "#111f34";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "rgba(56,189,248,0.24)";
          for (let wx = x + 7; wx < x + w - 4; wx += 12) {
            for (let wy = y + 9; wy < y + h - 5; wy += 13) {
              ctx.fillRect(wx, wy, 4, 5);
            }
          }
        });

        // Road recedes toward the center horizon; lane markers scroll to sell motion.
        ctx.fillStyle = "#101a2b";
        ctx.beginPath();
        ctx.moveTo(112, 91); ctx.lineTo(208, 91);
        ctx.lineTo(width + 24, height); ctx.lineTo(-24, height);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(125,211,252,0.24)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(112, 92); ctx.lineTo(-12, height);
        ctx.moveTo(208, 92); ctx.lineTo(width + 12, height);
        ctx.stroke();
        ctx.strokeStyle = "rgba(226,232,240,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([13, 14]);
        ctx.lineDashOffset = -t * 0.7;
        ctx.beginPath();
        ctx.moveTo(160, 96); ctx.lineTo(160, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Two independently moving synthetic subjects.
        const personX = 92 + Math.sin(t / 34) * 30;
        const personY = 147 + Math.sin(t / 50) * 5;
        const carX = 224 + Math.sin(t / 45) * 42;
        const carY = 166 + Math.cos(t / 58) * 3;
        drawPerson(personX, personY);
        drawVehicle(carX, carY);

        const targetX = isVehicle ? carX : personX;
        const targetY = isVehicle ? carY : personY - 7;
        const objectLabel = detection
          ? `${isVehicle ? "PLATE" : "PERSON"}  ${detection.entity_value}`
          : `${isVehicle ? "VEHICLE" : "PERSON"}  SCANNING`;
        drawTargetBox(
          targetX,
          targetY,
          isVehicle ? 52 : 30,
          isVehicle ? 34 : 43,
          objectLabel,
          targetColor,
        );

        // Search sweep and focal reticle suggest the detector cycling the frame.
        const sweepY = 38 + ((t * 1.6) % (height - 42));
        const gradient = ctx.createLinearGradient(0, sweepY - 14, 0, sweepY + 14);
        gradient.addColorStop(0, "rgba(56,189,248,0)");
        gradient.addColorStop(0.5, "rgba(56,189,248,0.12)");
        gradient.addColorStop(1, "rgba(56,189,248,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, sweepY - 14, width, 28);

        ctx.strokeStyle = "rgba(125,211,252,0.34)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 7, 103); ctx.lineTo(width / 2 + 7, 103);
        ctx.moveTo(width / 2, 96); ctx.lineTo(width / 2, 110);
        ctx.stroke();

      } else {
        ctx.fillStyle = "rgba(239,68,68,0.7)";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("NO SIGNAL", width / 2, height / 2);
        ctx.textAlign = "left";
      }

      t += 1.4;
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [camera.status]);

  const statusLabel = {
    online: "Working",
    degraded: "Degraded",
    offline: "Offline",
  }[camera.status] || camera.status || "Unknown";

  return (
    <div className="video-tile">
      <canvas ref={canvasRef} width={320} height={200} />
      <div className="video-tile-overlay-top">
        <span className="video-tile-name">{camera.name}</span>
        <span className="status-dot" style={{ backgroundColor: STATUS_COLORS[camera.status] || "#666" }} />
        <span className="video-tile-status">{statusLabel}</span>
      </div>
      {camera.status !== "offline" && (
        <div className="video-tile-ai-badge"><span /> AI SIM · TRACKING</div>
      )}
      <div className={`video-tile-overlay-bottom${lastDetection ? "" : " searching"}`}>
        {lastDetection ? (
          <>{lastDetection.entity_type === "vehicle_plate" ? "🚗" : "🧍"} {lastDetection.entity_value}</>
        ) : "⌕ Searching for objects…"}
        {lastDetection && <span className="dim"> · {(lastDetection.confidence * 100).toFixed(0)}%</span>}
      </div>
    </div>
  );
}

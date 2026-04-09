import React from 'react';
import { useNavigate } from 'react-router-dom';

function VisitorResponsesPage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '20px', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: '12px' }}>Visitor Responses</h1>

        <p style={{ color: '#475569', marginBottom: '24px' }}>
          View visitor-submitted lost item reports from the linked Google Sheet.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() =>
              window.open(
                'https://docs.google.com/spreadsheets/d/1Oky068WoEHMlzx-lo_U_0rqXoJVXY_DHHWMSAffludY/edit?gid=21380433#gid=21380433',
                '_blank'
              )
            }
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Open Responses Sheet
          </button>

          <button
            onClick={() => navigate('/valuables')}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Back to Valuables
          </button>
        </div>
      </div>
    </div>
  );
}

export default VisitorResponsesPage;
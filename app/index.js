// pages/index.js
import { useState, useEffect } from 'react';
import { Athena } from 'aws-sdk';
import Head from 'next/head';

// Configure AWS to use IAM role
const athena = new Athena({
  region: 'us-east-1'
});

export default function Home() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const params = {
        QueryString: 'SELECT * FROM project.gse LIMIT 10',
        QueryExecutionContext: {
          Database: 'project'
        },
        ResultConfiguration: {
          OutputLocation: 's3://danielspohn-bioinformatics-ms/athena-results/'
        }
      };

      // Start query execution
      const startQueryResponse = await athena.startQueryExecution(params).promise();
      const queryExecutionId = startQueryResponse.QueryExecutionId;

      // Poll for query completion
      let queryStatus;
      do {
        const queryExecution = await athena
          .getQueryExecution({ QueryExecutionId: queryExecutionId })
          .promise();
        queryStatus = queryExecution.QueryExecution.Status.State;
        if (queryStatus === 'FAILED' || queryStatus === 'CANCELLED') {
          throw new Error(`Query ${queryStatus}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED');

      // Get query results
      const results = await athena
        .getQueryResults({ QueryExecutionId: queryExecutionId })
        .promise();

      // Transform results into usable format
      const headers = results.ResultSet.ResultSetMetadata.ColumnInfo.map(
        column => column.Name
      );
      const rows = results.ResultSet.Rows.slice(1).map(row => {
        const rowData = {};
        row.Data.forEach((cell, index) => {
          rowData[headers[index]] = cell.VarCharValue;
        });
        return rowData;
      });

      setData(rows);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container mx-auto p-4">
      <Head>
        <title>Athena Data Viewer</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1 className="text-2xl font-bold mb-4">Athena Data Viewer</h1>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                {data[0] &&
                  Object.keys(data[0]).map(header => (
                    <th
                      key={header}
                      className="px-6 py-3 border-b border-gray-300 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  {Object.values(row).map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-6 py-4 whitespace-nowrap border-b border-gray-300"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

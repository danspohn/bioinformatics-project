import { Athena } from 'aws-sdk';

export default async function handler(req, res) {
  // Configure AWS to use IAM role
  const athena = new Athena({
    region: 'us-east-1'
  });

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

    // Transform results
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

    res.status(200).json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

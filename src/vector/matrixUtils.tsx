export async function getMatrixUtils() {
    const dis = (await import('matrix-react-sdk/src/dispatcher/dispatcher')).default;
    const { Action } = await import('matrix-react-sdk/src/dispatcher/actions');
    return { dis, Action };
}